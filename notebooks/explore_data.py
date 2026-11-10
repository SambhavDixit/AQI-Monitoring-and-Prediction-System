
import os
import json
import joblib
import pandas as pd

from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.preprocessing import OneHotEncoder
from sklearn.pipeline import Pipeline
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score


# --------------------------------
# 1. LOAD AND PREPARE DATA
# --------------------------------

df = pd.read_csv("data/city_day.csv")
df = df.dropna(subset=["AQI"]).copy()
df["Date"] = pd.to_datetime(df["Date"])

pollutant_columns = [
    "PM2.5", "PM10", "NO", "NO2", "NOx",
    "NH3", "CO", "SO2", "O3",
    "Benzene", "Toluene"
]

df = df.drop(columns=["Xylene"])
df = df.sort_values(["City", "Date"]).reset_index(drop=True)

df["Next_Day_AQI"] = df.groupby("City")["AQI"].shift(-1)
df["Next_Date"] = df.groupby("City")["Date"].shift(-1)

df = df[
    (df["Next_Date"] - df["Date"]).dt.days == 1
].copy()

df["Month"] = df["Date"].dt.month


# --------------------------------
# 2. FEATURES AND TARGET
# --------------------------------

numeric_features = pollutant_columns + ["AQI", "Month"]
categorical_features = ["City"]

feature_columns = numeric_features + categorical_features

X = df[feature_columns]
y = df["Next_Day_AQI"]


# --------------------------------
# 3. CHRONOLOGICAL TRAIN-TEST SPLIT
# --------------------------------

unique_dates = sorted(df["Date"].unique())

split_index = int(len(unique_dates) * 0.8)
split_date = unique_dates[split_index]

train_mask = df["Next_Date"] < split_date
test_mask = df["Date"] >= split_date

X_train = X.loc[train_mask]
X_test = X.loc[test_mask]

y_train = y.loc[train_mask]
y_test = y.loc[test_mask]


# --------------------------------
# 4. CREATE MODEL
# --------------------------------

def create_model():

    preprocessor = ColumnTransformer(
        transformers=[
            (
                "num",
                SimpleImputer(strategy="median"),
                numeric_features
            ),
            (
                "cat",
                OneHotEncoder(handle_unknown="ignore"),
                categorical_features
            )
        ]
    )

    model = Pipeline(steps=[
        ("preprocessor", preprocessor),
        ("regressor", RandomForestRegressor(
            n_estimators=200,
            random_state=42,
            min_samples_leaf=2,
            n_jobs=-1
        ))
    ])

    return model


# --------------------------------
# 5. TRAIN AND EVALUATE
# --------------------------------

print("Training selected Random Forest model...")

model = create_model()
model.fit(X_train, y_train)

predictions = model.predict(X_test)

mae = mean_absolute_error(y_test, predictions)
rmse = mean_squared_error(y_test, predictions) ** 0.5
r2 = r2_score(y_test, predictions)

baseline_predictions = df.loc[y_test.index, "AQI"].values

baseline_mae = mean_absolute_error(
    y_test,
    baseline_predictions
)

baseline_rmse = mean_squared_error(
    y_test,
    baseline_predictions
) ** 0.5

print("\nMODEL EVALUATION")
print("----------------")
print("Split date:", split_date)
print("Training records:", len(X_train))
print("Testing records:", len(X_test))

print("\nRandom Forest:")
print("MAE:", round(mae, 2))
print("RMSE:", round(rmse, 2))
print("R2 Score:", round(r2, 4))

print("\nBaseline:")
print("MAE:", round(baseline_mae, 2))
print("RMSE:", round(baseline_rmse, 2))


# --------------------------------
# 6. CITY-WISE PERFORMANCE
# --------------------------------

print("\nCITY-WISE MODEL PERFORMANCE")
print("----------------------------")

test_results = df.loc[y_test.index, ["City", "AQI"]].copy()

test_results["Actual_AQI"] = y_test
test_results["Predicted_AQI"] = predictions
test_results["Baseline_AQI"] = baseline_predictions

city_metrics = []

for city, group in test_results.groupby("City"):

    city_mae = mean_absolute_error(
        group["Actual_AQI"],
        group["Predicted_AQI"]
    )

    city_rmse = mean_squared_error(
        group["Actual_AQI"],
        group["Predicted_AQI"]
    ) ** 0.5

    city_baseline_mae = mean_absolute_error(
        group["Actual_AQI"],
        group["Baseline_AQI"]
    )

    city_metrics.append({
        "City": city,
        "Records": len(group),
        "MAE": round(city_mae, 2),
        "RMSE": round(city_rmse, 2),
        "Baseline_MAE": round(city_baseline_mae, 2)
    })

city_results = pd.DataFrame(city_metrics)
city_results = city_results.sort_values(
    "MAE",
    ascending=False
)

print(city_results.to_string(index=False))

os.makedirs("reports", exist_ok=True)

city_results.to_csv(
    "reports/city_wise_performance.csv",
    index=False
)

print("\nCity-wise results saved to reports/city_wise_performance.csv")


# --------------------------------
# 7. AQI CATEGORY PERFORMANCE
# --------------------------------

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
    else:
        return "Severe"


test_results["Category"] = test_results["Actual_AQI"].apply(
    get_aqi_category
)

category_metrics = []

for category, group in test_results.groupby("Category"):

    category_metrics.append({
        "Category": category,
        "Records": len(group),
        "MAE": round(
            mean_absolute_error(
                group["Actual_AQI"],
                group["Predicted_AQI"]
            ),
            2
        )
    })

category_results = pd.DataFrame(category_metrics)

print("\nAQI CATEGORY-WISE PERFORMANCE")
print("-----------------------------")
print(category_results.to_string(index=False))

category_results.to_csv(
    "reports/category_wise_performance.csv",
    index=False
)


# --------------------------------
# 8. TRAIN FINAL MODEL ON ALL DATA
# --------------------------------

print("\nTraining final model on all available data...")

final_model = create_model()
final_model.fit(X, y)

os.makedirs("models", exist_ok=True)

model_artifact = {
    "model": final_model,
    "feature_columns": feature_columns,
    "pollutant_columns": pollutant_columns,
    "target": "Next_Day_AQI",
    "model_name": "Random Forest Regressor",
    "training_records": len(X),
    "evaluation": {
        "mae": round(mae, 2),
        "rmse": round(rmse, 2),
        "r2": round(r2, 4),
        "baseline_mae": round(baseline_mae, 2),
        "baseline_rmse": round(baseline_rmse, 2)
    }
}

joblib.dump(
    model_artifact,
    "models/aqi_model.joblib"
)

metadata = {
    "model_name": "Random Forest Regressor",
    "target": "Next_Day_AQI",
    "features": feature_columns,
    "training_records": len(X),
    "evaluation": model_artifact["evaluation"]
}

with open("models/model_metadata.json", "w") as file:
    json.dump(metadata, file, indent=4)

print("\nMODEL SAVED SUCCESSFULLY")
print("------------------------")
print("Model: models/aqi_model.joblib")
print("Metadata: models/model_metadata.json")
print("City report: reports/city_wise_performance.csv")
print("Category report: reports/category_wise_performance.csv")
print("Total training records:", len(X))
