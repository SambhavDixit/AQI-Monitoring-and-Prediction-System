
import math
import hashlib
import urllib.request
import joblib
import pandas as pd

from pathlib import Path
from datetime import timedelta
from flask import Flask, jsonify, request, render_template


# ==================================================
# 1. CONFIGURATION
# ==================================================

app = Flask(__name__)

BASE_DIR = Path(__file__).resolve().parent

DATA_PATH = BASE_DIR / "data" / "city_day.csv"
MODEL_PATH = BASE_DIR / "models" / "aqi_model.joblib"
REPORTS_DIR = BASE_DIR / "reports"

MODEL_URL = (
    "https://github.com/SambhavDixit/"
    "AQI-Monitoring-and-Prediction-System/"
    "releases/download/v1.0.0/aqi_model.joblib"
)

MODEL_SHA256 = (
    "f3e7c3838298e0793b57eb6eed60b72fc7d111ee539635f3753af14b39f46fb6"
)


# ==================================================
# 2. DOWNLOAD MODEL IF NOT AVAILABLE
# ==================================================

def download_model():

    if MODEL_PATH.exists():
        print("Existing trained model found.")
        return

    print("\nTrained model not found.")
    print("Downloading model from GitHub Release...")

    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)

    temp_path = MODEL_PATH.with_suffix(".download")

    try:

        request_obj = urllib.request.Request(
            MODEL_URL,
            headers={"User-Agent": "AQI-Monitoring-System"}
        )

        sha256 = hashlib.sha256()

        with urllib.request.urlopen(
            request_obj,
            timeout=120
        ) as response:

            with open(temp_path, "wb") as file:

                while True:

                    chunk = response.read(1024 * 1024)

                    if not chunk:
                        break

                    file.write(chunk)
                    sha256.update(chunk)

        downloaded_hash = sha256.hexdigest()

        if downloaded_hash != MODEL_SHA256:

            raise ValueError(
                "Model SHA256 verification failed."
            )

        temp_path.replace(MODEL_PATH)

        print("Model downloaded successfully.")
        print("SHA256 verification successful.")

    except Exception as error:

        if temp_path.exists():
            temp_path.unlink()

        raise RuntimeError(
            f"Unable to download trained model: {error}"
        ) from error


# Download model before loading the application
download_model()


if not DATA_PATH.exists():
    raise FileNotFoundError(
        "Dataset not found in the data folder."
    )

artifact = joblib.load(MODEL_PATH)

model = artifact["model"]
feature_columns = artifact["feature_columns"]
pollutant_columns = artifact["pollutant_columns"]


# ==================================================
# 3. LOAD DATA
# ==================================================

df = pd.read_csv(DATA_PATH)

df = df.dropna(subset=["AQI"]).copy()

df["Date"] = pd.to_datetime(
    df["Date"],
    errors="coerce"
)

df["City"] = df["City"].astype(str).str.strip()

df = df.dropna(subset=["Date"])

df = df.sort_values(
    ["City", "Date"]
).reset_index(drop=True)

df["Month"] = df["Date"].dt.month

latest_records = (
    df.groupby("City", sort=True)
    .tail(1)
    .set_index("City")
    .sort_index()
)

available_cities = sorted(
    latest_records.index.tolist()
)


# ==================================================
# 4. HELPER FUNCTIONS
# ==================================================

def get_aqi_category(aqi):

    if aqi <= 50:
        return "Good"
    elif aqi <= 100:
        return "Satisfactory"
    elif aqi <= 200:
        return "Moderate"
    elif aqi <= 300:
        return "Poor"
    elif aqi <= 400:
        return "Very Poor"

    return "Severe"


def safe_number(value):

    if pd.isna(value):
        return None

    return round(float(value), 2)


def get_city(city):

    city_lookup = {
        name.lower(): name
        for name in available_cities
    }

    return city_lookup.get(city.strip().lower())


def load_report(filename):

    path = REPORTS_DIR / filename

    if not path.exists():
        return []

    report = pd.read_csv(path)

    report = report.where(
        pd.notna(report),
        None
    )

    return report.to_dict(orient="records")


# ==================================================
# 5. HOME PAGE
# ==================================================

@app.route("/")
def home():

    return render_template("index.html")


# ==================================================
# 6. HEALTH CHECK
# ==================================================

@app.route("/api/health")
def health():

    return jsonify({
        "status": "healthy",
        "model_loaded": model is not None,
        "dataset_loaded": not df.empty,
        "available_cities": len(available_cities)
    })


# ==================================================
# 7. AVAILABLE CITIES
# ==================================================

@app.route("/api/cities")
def get_cities():

    return jsonify({
        "count": len(available_cities),
        "cities": available_cities
    })


# ==================================================
# 8. MODEL INFORMATION
# ==================================================

@app.route("/api/model-info")
def model_info():

    return jsonify({

        "model_name": artifact.get(
            "model_name",
            "Random Forest Regressor"
        ),

        "target": artifact.get("target"),

        "evaluation": artifact.get(
            "evaluation",
            {}
        ),

        "training_records": artifact.get(
            "training_records",
            0
        )

    })


# ==================================================
# 9. MAIN DASHBOARD
# ==================================================

@app.route("/api/dashboard")
def dashboard():

    city = request.args.get(
        "city",
        ""
    ).strip()

    if not city:

        return jsonify({
            "error": "Please provide a city name."
        }), 400

    matched_city = get_city(city)

    if matched_city is None:

        return jsonify({
            "error": "City not found in the dataset."
        }), 404

    record = latest_records.loc[matched_city]

    input_data = pd.DataFrame([{

        column: (
            matched_city if column == "City"
            else int(record["Month"]) if column == "Month"
            else record[column]
        )

        for column in feature_columns

    }])

    prediction = float(
        model.predict(input_data)[0]
    )

    if not math.isfinite(prediction):

        return jsonify({
            "error": "Model generated an invalid prediction."
        }), 500

    prediction = max(0.0, prediction)

    current_aqi = float(record["AQI"])

    observation_date = record["Date"]

    prediction_date = (
        observation_date + timedelta(days=1)
    )

    pollutants = {

        pollutant: safe_number(record[pollutant])

        for pollutant in pollutant_columns

    }

    return jsonify({

        "city": matched_city,

        "data_source": "Historical Kaggle dataset",

        "data_status": "historical",

        "observation_date": observation_date.strftime(
            "%Y-%m-%d"
        ),

        "prediction_date": prediction_date.strftime(
            "%Y-%m-%d"
        ),

        "current_aqi": round(current_aqi, 2),

        "current_category": get_aqi_category(
            current_aqi
        ),

        "predicted_aqi": round(prediction, 2),

        "predicted_category": get_aqi_category(
            prediction
        ),

        "pollutants": pollutants

    })


# ==================================================
# 10. HISTORICAL AQI TREND
# ==================================================

@app.route("/api/history")
def history():

    city = request.args.get(
        "city",
        ""
    ).strip()

    try:

        days = int(
            request.args.get("days", 30)
        )

    except ValueError:

        return jsonify({
            "error": "Days must be a number."
        }), 400

    days = max(7, min(days, 365))

    if not city:

        return jsonify({
            "error": "Please provide a city name."
        }), 400

    matched_city = get_city(city)

    if matched_city is None:

        return jsonify({
            "error": "City not found."
        }), 404

    city_data = df[
        df["City"] == matched_city
    ].copy()

    city_data = city_data.sort_values(
        "Date"
    ).tail(days)

    records = []

    for _, row in city_data.iterrows():

        records.append({

            "date": row["Date"].strftime(
                "%Y-%m-%d"
            ),

            "aqi": safe_number(row["AQI"]),

            "category": get_aqi_category(
                float(row["AQI"])
            )

        })

    return jsonify({

        "city": matched_city,

        "days_requested": days,

        "records": records

    })


# ==================================================
# 11. POLLUTANT HISTORY
# ==================================================

@app.route("/api/pollutant-history")
def pollutant_history():

    city = request.args.get(
        "city",
        ""
    ).strip()

    if not city:

        return jsonify({
            "error": "Please provide a city name."
        }), 400

    matched_city = get_city(city)

    if matched_city is None:

        return jsonify({
            "error": "City not found."
        }), 404

    city_data = (

        df[df["City"] == matched_city]

        .sort_values("Date")

        .tail(30)

    )

    records = []

    for _, row in city_data.iterrows():

        item = {

            "date": row["Date"].strftime(
                "%Y-%m-%d"
            )

        }

        for pollutant in pollutant_columns:

            item[pollutant] = safe_number(
                row[pollutant]
            )

        records.append(item)

    return jsonify({

        "city": matched_city,

        "pollutants": pollutant_columns,

        "records": records

    })


# ==================================================
# 12. CITY COMPARISON
# ==================================================

@app.route("/api/city-comparison")
def city_comparison():

    comparison = latest_records.reset_index()[

        ["City", "AQI", "Date"]

    ].copy()

    comparison["Category"] = comparison[
        "AQI"
    ].apply(get_aqi_category)

    comparison = comparison.sort_values(
        "AQI",
        ascending=False
    )

    records = []

    for _, row in comparison.iterrows():

        records.append({

            "city": row["City"],

            "aqi": safe_number(row["AQI"]),

            "category": row["Category"],

            "date": row["Date"].strftime(
                "%Y-%m-%d"
            )

        })

    return jsonify({

        "count": len(records),

        "cities": records

    })


# ==================================================
# 13. MODEL PERFORMANCE REPORTS
# ==================================================

@app.route("/api/city-performance")
def city_performance():

    return jsonify({

        "results": load_report(
            "city_wise_performance.csv"
        )

    })


@app.route("/api/category-performance")
def category_performance():

    return jsonify({

        "results": load_report(
            "category_wise_performance.csv"
        )

    })


# ==================================================
# 14. ERROR HANDLING
# ==================================================

@app.errorhandler(404)
def not_found(error):

    return jsonify({

        "error": "The requested endpoint was not found."

    }), 404


@app.errorhandler(500)
def internal_error(error):

    return jsonify({

        "error": "An internal server error occurred."

    }), 500


# ==================================================
# 15. RUN APPLICATION
# ==================================================

if __name__ == "__main__":

    print(
        "\nAeroSense - AQI Monitoring and Prediction"
    )

    print("-----------------------------------------")

    print(
        "Available cities:",
        len(available_cities)
    )

    print(
        "Training records:",
        artifact.get("training_records", "N/A")
    )

    print("ML model loaded successfully.")

    print("Starting Flask server...")

    app.run(

        host="127.0.0.1",

        port=5000,

        debug=True

    )
