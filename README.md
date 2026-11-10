
# AQI Monitoring and Prediction System

AeroSense is a web-based Air Quality Index (AQI) monitoring and prediction system that provides historical air quality insights, pollutant analysis, city-wise comparisons, and machine learning-based next-day AQI predictions for Indian cities.

## Project Overview

The system uses historical air quality data and a trained Random Forest Regression model to estimate next-day AQI values.

Users can select a city, explore its latest available AQI observations, view pollutant concentrations, analyse historical trends, and compare air quality across different cities.

**Note:** The displayed observations are historical dataset records, not live sensor measurements.

## Key Features

- City-wise AQI monitoring for 26 Indian cities.
- Machine learning-based next-day AQI prediction.
- AQI category classification.
- Historical AQI trend analysis.
- Pollutant concentration monitoring.
- City-wise air quality comparison.
- Model performance evaluation by city and AQI category.
- REST API integration using Flask.

## Technologies Used

| Component | Technology |
|---|---|
| Frontend | HTML, CSS, JavaScript |
| Backend | Python, Flask |
| Data Processing | Pandas, NumPy |
| Machine Learning | Scikit-learn |
| Model Storage | Joblib |
| Dataset | Historical Indian Air Quality Dataset |

## Machine Learning Model

The system uses a Random Forest Regressor to predict next-day AQI.

**Prediction Target:** Next_Day_AQI

**Input Features:**
- PM2.5, PM10
- NO, NO2, NOx, NH3
- CO, SO2, O3
- Benzene, Toluene
- Previous AQI
- Month
- City

**Training Records:** 24,343

### Overall Model Performance

| Metric | Model | Baseline |
|---|---:|---:|
| MAE | 20.39 | 22.10 |
| RMSE | 42.71 | 47.27 |
| R² Score | 0.8303 | — |

The model achieves an R² score of 0.8303 on the reported evaluation and improves upon the baseline in both MAE and RMSE.

### Category-wise Performance

| AQI Category | Records | MAE |
|---|---:|---:|
| Good | 907 | 13.37 |
| Satisfactory | 3822 | 11.15 |
| Moderate | 2723 | 19.53 |
| Poor | 634 | 35.67 |
| Very Poor | 378 | 41.10 |
| Severe | 224 | 138.91 |

Performance varies across AQI categories, with higher prediction errors in the Severe category.

### City-wise Performance

Detailed evaluation results are available in:

- `reports/city_wise_performance.csv`
- `reports/category_wise_performance.csv`

## Project Structure

```text
AQI Monitoring & Prediction System/
│
├── app.py
├── requirements.txt
├── README.md
├── .gitignore
│
├── data/
│   └── city_day.csv
│
├── models/
│   ├── aqi_model.joblib
│   └── model_metadata.json
│
├── notebooks/
│   └── explore_data.py
│
├── reports/
│   ├── category_wise_performance.csv
│   └── city_wise_performance.csv
│
├── static/
│   ├── script.js
│   ├── style.css
│   └── images/
│
└── templates/
    └── index.html
```

## Installation and Setup

### 1. Clone the repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd AQI-Monitoring-and-Prediction-System
```

### 2. Create a virtual environment

```bash
python -m venv venv
```

### 3. Activate the environment

Windows:

```powershell
venv\Scripts\activate
```

### 4. Install dependencies

```bash
pip install -r requirements.txt
```

### 5. Add the trained model

The trained model is approximately 184 MB and is distributed separately through the project's GitHub Releases.

Place the downloaded `aqi_model.joblib` file inside the `models/` directory.

### 6. Run the application

```bash
python app.py
```

Open your browser and visit:

http://127.0.0.1:5000

## API Endpoints

| Endpoint | Description |
|---|---|
| `/api/health` | Application health status |
| `/api/cities` | List available cities |
| `/api/model-info` | Model information and evaluation |
| `/api/dashboard?city=Delhi` | AQI dashboard data and prediction |
| `/api/history?city=Delhi&days=30` | Historical AQI trends |
| `/api/pollutant-history?city=Delhi` | Historical pollutant data |
| `/api/city-comparison` | Compare cities |
| `/api/city-performance` | City-wise model performance |
| `/api/category-performance` | Category-wise model performance |

## Limitations

- Predictions are based on historical observations and are not real-time forecasts from monitoring sensors.
- Model performance varies across cities and AQI categories.
- Prediction accuracy is comparatively lower for some high-pollution categories.
- The system is intended for informational and educational purposes.

## Future Improvements

- Integration with real-time air quality APIs and IoT sensors.
- Improved prediction accuracy for high-pollution categories.
- Extended forecasting capabilities.
- Interactive geographical AQI visualisation.
- Cloud deployment and improved application scalability.

## Author

Developed as a machine learning and web development project focused on analysing and predicting air quality across Indian cities.
