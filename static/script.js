
const API = {
    cities: "/api/cities",
    dashboard: "/api/dashboard",
    model: "/api/model-info",
    history: "/api/history",
    pollutants: "/api/pollutant-history",
    comparison: "/api/city-comparison",
    cityPerformance: "/api/city-performance",
    categoryPerformance: "/api/category-performance"
};

const pollutantUnits = {
    "PM2.5": "µg/m³",
    "PM10": "µg/m³",
    "NO": "µg/m³",
    "NO2": "µg/m³",
    "NOx": "ppb",
    "NH3": "µg/m³",
    "CO": "mg/m³",
    "SO2": "µg/m³",
    "O3": "µg/m³",
    "Benzene": "µg/m³",
    "Toluene": "µg/m³"
};

const charts = {};
let selectedCity = "";
let pollutantHistoryData = [];

const $ = (id) => document.getElementById(id);


// ==================================================
// 1. API HELPERS
// ==================================================

async function fetchJSON(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Request failed: ${url} (${response.status})`);
    }

    return response.json();
}


// FIXED: Supports API responses containing "results"
function getArray(data, possibleKeys = []) {
    if (Array.isArray(data)) return data;

    if (Array.isArray(data?.results)) {
        return data.results;
    }

    for (const key of possibleKeys) {
        if (Array.isArray(data?.[key])) {
            return data[key];
        }
    }

    return [];
}


function getNumber(...values) {
    for (const value of values) {
        if (value !== null && value !== undefined && value !== "") {
            const number = Number(value);

            if (Number.isFinite(number)) {
                return number;
            }
        }
    }

    return null;
}


function formatNumber(value, decimals = 2) {
    const number = getNumber(value);

    if (number === null) return "--";

    return number.toLocaleString("en-IN", {
        maximumFractionDigits: decimals
    });
}


function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return String(value);
    }

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}


function setText(id, value) {
    const element = $(id);

    if (element) {
        element.textContent = value ?? "—";
    }
}


function showToast(message) {
    const toast = $("toast");

    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}


// ==================================================
// 2. AQI CATEGORY COLORS
// ==================================================

function getCategoryColor(category) {
    const value = String(category || "").toLowerCase();

    if (value.includes("good")) return "#56d6b0";
    if (value.includes("satisfactory")) return "#8bd17c";
    if (value.includes("moderate")) return "#e8c66a";
    if (value.includes("poor")) return "#f3a15d";
    if (value.includes("very poor")) return "#ed7777";
    if (value.includes("severe")) return "#bb83ee";

    return "#65a8ff";
}


// ==================================================
// 3. CHART CONFIGURATION
// ==================================================

function createOrUpdateChart(id, config) {
    const canvas = $(id);

    if (!canvas || typeof Chart === "undefined") {
        return;
    }

    if (charts[id]) {
        charts[id].destroy();
    }

    charts[id] = new Chart(canvas, config);
}


function commonChartOptions(yTitle = "") {
    return {
        responsive: true,

        maintainAspectRatio: false,

        interaction: {
            intersect: false,
            mode: "index"
        },

        plugins: {
            legend: {
                labels: {
                    color: "#aab8cc",
                    usePointStyle: true,
                    boxWidth: 8,
                    font: {
                        family: "DM Sans",
                        size: 11
                    }
                }
            },

            tooltip: {
                backgroundColor: "#17243a",
                titleColor: "#ffffff",
                bodyColor: "#c6d3e5",
                borderColor: "#34445e",
                borderWidth: 1,
                padding: 11
            }
        },

        scales: {
            x: {
                ticks: {
                    color: "#8291a8",
                    maxTicksLimit: 10,
                    font: {
                        size: 10
                    }
                },

                grid: {
                    color: "rgba(130,145,168,0.08)"
                }
            },

            y: {
                beginAtZero: true,

                title: {
                    display: Boolean(yTitle),
                    text: yTitle,
                    color: "#8291a8"
                },

                ticks: {
                    color: "#8291a8",
                    font: {
                        size: 10
                    }
                },

                grid: {
                    color: "rgba(130,145,168,0.10)"
                }
            }
        }
    };
}


// ==================================================
// 4. LOAD CITIES
// ==================================================

async function loadCities() {
    const data = await fetchJSON(API.cities);

    let cities = getArray(data, ["cities", "data"]);

    if (cities.length && typeof cities[0] === "object") {
        cities = cities
            .map(item => item.city || item.name)
            .filter(Boolean);
    }

    const select = $("citySelect");

    select.innerHTML = "";

    cities.sort((a, b) =>
        String(a).localeCompare(String(b))
    );

    cities.forEach(city => {
        const option = document.createElement("option");

        option.value = city;
        option.textContent = city;

        select.appendChild(option);
    });

    if (!cities.length) {
        throw new Error("No cities were returned by the API.");
    }

    selectedCity = cities.includes("Delhi")
        ? "Delhi"
        : cities[0];

    select.value = selectedCity;

    select.addEventListener("change", async () => {
        selectedCity = select.value;
        await loadCityDashboard();
    });

    await loadCityDashboard();
}


// ==================================================
// 5. CITY DASHBOARD DATA
// ==================================================

async function loadCityDashboard() {
    if (!selectedCity) return;

    try {
        const city = encodeURIComponent(selectedCity);

        const [dashboard, history, pollutants] = await Promise.all([
            fetchJSON(`${API.dashboard}?city=${city}`),

            fetchJSON(
                `${API.history}?city=${city}&days=${$("historyRange").value}`
            ),

            fetchJSON(`${API.pollutants}?city=${city}`)
        ]);

        updateOverview(dashboard);

        updateHistoryChart(history);

        updatePollutantData(pollutants);

    } catch (error) {
        console.error("City dashboard error:", error);

        showToast("Unable to load city data. Check the Flask terminal.");
    }
}


// ==================================================
// 6. OVERVIEW SECTION
// ==================================================

function updateOverview(data) {
    const currentAQI = getNumber(
        data.current_aqi,
        data.aqi,
        data.latest_aqi
    );

    const predictedAQI = getNumber(
        data.predicted_aqi,
        data.prediction,
        data.next_day_aqi
    );

    setText("selectedCity", data.city || selectedCity);

    setText(
        "observationDate",
        `Observation date: ${formatDate(
            data.latest_observation_date ||
            data.observation_date ||
            data.date
        )}`
    );

    setText("currentAQI", formatNumber(currentAQI, 0));

    setText("predictedAQI", formatNumber(predictedAQI, 0));

    setText(
        "currentCategory",
        data.current_category || data.aqi_category || "Unavailable"
    );

    setText(
        "predictedCategory",
        data.predicted_category || data.prediction_category || "Unavailable"
    );

    setText(
        "predictionDate",
        formatDate(data.prediction_date)
    );

    setText("comparisonCurrent", formatNumber(currentAQI, 0));

    setText("comparisonPredicted", formatNumber(predictedAQI, 0));

    const difference =
        currentAQI !== null && predictedAQI !== null
            ? predictedAQI - currentAQI
            : null;

    if (difference === null) {
        setText("aqiDifference", "--");

        setText(
            "aqiInsight",
            "Prediction comparison is unavailable."
        );

    } else {
        const sign = difference > 0 ? "+" : "";

        setText(
            "aqiDifference",
            `${sign}${formatNumber(difference, 0)} AQI`
        );

        setText(
            "aqiInsight",

            difference > 0
                ? "The model predicts an increase in AQI."

                : difference < 0
                    ? "The model predicts a decrease in AQI."

                    : "The model predicts no change in AQI."
        );
    }

    const maxValue = Math.max(
        currentAQI || 0,
        predictedAQI || 0,
        100
    );

    $("currentBar").style.width =
        `${Math.min(100, (currentAQI || 0) / maxValue * 100)}%`;

    $("predictedBar").style.width =
        `${Math.min(100, (predictedAQI || 0) / maxValue * 100)}%`;

    const gauge = $("aqiGauge");

    if (gauge && currentAQI !== null) {
        const color = getCategoryColor(
            data.current_category || data.aqi_category
        );

        const degrees = Math.min(
            360,
            Math.max(0, currentAQI / 500 * 360)
        );

        gauge.style.setProperty("--gauge-color", color);

        gauge.style.background =
            `conic-gradient(${color} ${degrees}deg, #29364b ${degrees}deg)`;
    }

    const pollutants = data.pollutants || {};

    updatePollutantCards(pollutants);
}


// ==================================================
// 7. POLLUTANT CARDS
// ==================================================

function updatePollutantCards(pollutants) {
    const grid = $("pollutantGrid");

    grid.innerHTML = "";

    Object.entries(pollutantUnits).forEach(([name, unit]) => {
        const value = getNumber(pollutants[name]);

        const card = document.createElement("div");

        card.className = "pollutant-item";

        const label = document.createElement("span");
        label.textContent = name;

        const number = document.createElement("strong");
        number.textContent = formatNumber(value);

        const small = document.createElement("small");
        small.textContent = unit;

        card.append(label, number, small);

        grid.appendChild(card);
    });
}


// ==================================================
// 8. HISTORICAL AQI CHART
// ==================================================

function updateHistoryChart(data) {
    const rows = getArray(data, [
        "history",
        "records",
        "data",
        "observations"
    ]);

    const labels = rows.map(row =>
        formatDate(row.date || row.Date)
    );

    const values = rows.map(row =>
        getNumber(row.aqi, row.AQI)
    );

    createOrUpdateChart("historyChart", {
        type: "line",

        data: {
            labels,

            datasets: [{
                label: "AQI",

                data: values,

                borderColor: "#56d6b0",

                backgroundColor: "rgba(86,214,176,0.12)",

                fill: true,

                tension: 0.3,

                pointRadius: 1.5,

                pointHoverRadius: 5,

                borderWidth: 2,

                spanGaps: true
            }]
        },

        options: commonChartOptions("AQI")
    });
}


// ==================================================
// 9. POLLUTANT HISTORY CHART
// ==================================================

function updatePollutantData(data) {
    pollutantHistoryData = getArray(data, [
        "history",
        "records",
        "data",
        "observations"
    ]);

    updatePollutantChart();
}


function updatePollutantChart() {
    const pollutant = $("pollutantSelect").value;

    const unit = pollutantUnits[pollutant] || "";

    const labels = pollutantHistoryData.map(row =>
        formatDate(row.date || row.Date)
    );

    const values = pollutantHistoryData.map(row =>
        getNumber(row[pollutant])
    );

    setText(
        "pollutantChartTitle",
        `${pollutant} concentration`
    );

    createOrUpdateChart("pollutantChart", {
        type: "line",

        data: {
            labels,

            datasets: [{
                label: `${pollutant} (${unit})`,

                data: values,

                borderColor: "#a78bfa",

                backgroundColor: "rgba(167,139,250,0.12)",

                fill: true,

                tension: 0.3,

                pointRadius: 1.5,

                pointHoverRadius: 5,

                borderWidth: 2,

                spanGaps: true
            }]
        },

        options: commonChartOptions(unit)
    });
}


// ==================================================
// 10. MODEL PERFORMANCE METRICS
// ==================================================

function getModelEvaluation(data) {
    return (
        data?.evaluation ||
        data?.metrics ||
        data?.model_metrics ||
        data
    );
}


async function loadModelInfo() {
    try {
        const data = await fetchJSON(API.model);

        const metrics = getModelEvaluation(data);

        const mae = getNumber(
            metrics.mae,
            data.mae
        );

        const rmse = getNumber(
            metrics.rmse,
            data.rmse
        );

        const r2 = getNumber(
            metrics.r2,
            metrics.r2_score,
            data.r2,
            data.r2_score
        );

        const records = getNumber(
            data.training_records,
            data.records
        );

        setText("modelMAE", formatNumber(mae));

        setText("modelRMSE", formatNumber(rmse));

        setText(
            "modelR2",
            r2 === null ? "--" : formatNumber(r2, 4)
        );

        setText(
            "trainingRecords",
            records === null ? "--" : formatNumber(records, 0)
        );

        const baselineMAE = getNumber(
            metrics.baseline_mae,
            data.baseline_mae
        );

        if (baselineMAE !== null && mae !== null) {
            const improvement =
                ((baselineMAE - mae) / baselineMAE) * 100;

            setText(
                "modelNote",

                `The model's MAE is ${formatNumber(mae)} compared with a baseline MAE of ${formatNumber(baselineMAE)}. This represents a ${formatNumber(improvement, 1)}% ${improvement >= 0 ? "improvement" : "increase in error"} over the baseline. R² indicates the proportion of variance explained by the model; it is not prediction accuracy.`
            );
        }

    } catch (error) {
        console.error("Model information error:", error);

        showToast("Could not load model evaluation metrics.");
    }
}


// ==================================================
// 11. CITY COMPARISON CHART
// ==================================================

async function loadCityComparison() {
    try {
        const data = await fetchJSON(API.comparison);

        const rows = getArray(data, [
            "cities",
            "comparison",
            "data",
            "records"
        ]);

        const sorted = rows
            .map(row => ({
                city: row.city || row.City,

                aqi: getNumber(
                    row.aqi,
                    row.AQI,
                    row.current_aqi
                ),

                date: row.date || row.Date
            }))

            .filter(row =>
                row.city && row.aqi !== null
            )

            .sort((a, b) => b.aqi - a.aqi)

            .slice(0, 12);

        createOrUpdateChart("cityChart", {
            type: "bar",

            data: {
                labels: sorted.map(row => row.city),

                datasets: [{
                    label: "Latest AQI",

                    data: sorted.map(row => row.aqi),

                    backgroundColor: sorted.map(() =>
                        getCategoryColor("")
                    ),

                    borderRadius: 5,

                    barThickness: 18
                }]
            },

            options: {
                ...commonChartOptions("AQI"),

                indexAxis: "y",

                plugins: {
                    ...commonChartOptions().plugins,

                    legend: {
                        display: false
                    },

                    tooltip: {
                        callbacks: {
                            afterLabel: context =>
                                `Date: ${formatDate(
                                    sorted[context.dataIndex]?.date
                                )}`
                        }
                    }
                },

                scales: {
                    x: {
                        beginAtZero: true,

                        ticks: {
                            color: "#8291a8"
                        },

                        grid: {
                            color: "rgba(130,145,168,0.10)"
                        }
                    },

                    y: {
                        ticks: {
                            color: "#aab8cc"
                        },

                        grid: {
                            display: false
                        }
                    }
                }
            }
        });

    } catch (error) {
        console.error("City comparison error:", error);
    }
}


// ==================================================
// 12. CITY-WISE PREDICTION ERROR CHART
// ==================================================

async function loadCityPerformance() {
    try {
        const data = await fetchJSON(API.cityPerformance);

        // API returns: { results: [...] }
        const rows = getArray(data, [
            "performance",
            "cities",
            "data",
            "records"
        ]);

        console.log("City performance data:", rows);

        const sorted = rows

            .map(row => ({
                city: row.city || row.City,

                mae: getNumber(
                    row.mae,
                    row.MAE
                )
            }))

            .filter(row =>
                row.city && row.mae !== null
            )

            .sort((a, b) => b.mae - a.mae)

            .slice(0, 15);

        createOrUpdateChart("performanceChart", {
            type: "bar",

            data: {
                labels: sorted.map(row => row.city),

                datasets: [{
                    label: "Mean Absolute Error (MAE)",

                    data: sorted.map(row => row.mae),

                    backgroundColor: "#65a8ff",

                    borderRadius: 5,

                    barThickness: 15
                }]
            },

            options: {
                ...commonChartOptions("MAE"),

                indexAxis: "y",

                plugins: {
                    ...commonChartOptions().plugins,

                    legend: {
                        display: false
                    }
                },

                scales: {
                    x: {
                        beginAtZero: true,

                        ticks: {
                            color: "#8291a8"
                        },

                        grid: {
                            color: "rgba(130,145,168,0.10)"
                        }
                    },

                    y: {
                        ticks: {
                            color: "#aab8cc"
                        },

                        grid: {
                            display: false
                        }
                    }
                }
            }
        });

    } catch (error) {
        console.error("City performance error:", error);
    }
}


// ==================================================
// 13. AQI CATEGORY PREDICTION ERROR CHART
// ==================================================

async function loadCategoryPerformance() {
    try {
        const data = await fetchJSON(API.categoryPerformance);

        // API returns: { results: [...] }
        const rows = getArray(data, [
            "performance",
            "categories",
            "data",
            "records"
        ]);

        console.log("Category performance data:", rows);

        const categories = rows

            .map(row => ({
                category:
                    row.category ||
                    row.Category ||
                    row.aqi_bucket ||
                    row.AQI_Bucket,

                mae: getNumber(
                    row.mae,
                    row.MAE
                )
            }))

            .filter(row =>
                row.category && row.mae !== null
            );

        createOrUpdateChart("categoryChart", {
            type: "bar",

            data: {
                labels: categories.map(row => row.category),

                datasets: [{
                    label: "Mean Absolute Error (MAE)",

                    data: categories.map(row => row.mae),

                    backgroundColor: categories.map(row =>
                        getCategoryColor(row.category)
                    ),

                    borderRadius: 5
                }]
            },

            options: {
                ...commonChartOptions("MAE"),

                plugins: {
                    ...commonChartOptions().plugins,

                    legend: {
                        display: false
                    }
                }
            }
        });

    } catch (error) {
        console.error("Category performance error:", error);
    }
}


// ==================================================
// 14. SYSTEM HEALTH
// ==================================================

async function checkSystemHealth() {
    try {
        const data = await fetchJSON("/api/health");

        const status =
            data.status ||
            data.message ||
            "Connected";

        setText("systemStatus", status);

    } catch (error) {
        setText("systemStatus", "Connection issue");

        console.error("Health check error:", error);
    }
}


// ==================================================
// 15. EVENT LISTENERS
// ==================================================

function setupControls() {

    $("historyRange").addEventListener(
        "change",
        loadCityDashboard
    );

    $("pollutantSelect").addEventListener(
        "change",
        updatePollutantChart
    );
}


// ==================================================
// 16. INITIALIZE DASHBOARD
// ==================================================

async function initializeDashboard() {

    setupControls();

    if (typeof Chart === "undefined") {
        showToast(
            "Chart.js could not load. Check your internet connection."
        );

        return;
    }

    try {
        await checkSystemHealth();

        await loadCities();

        await Promise.all([
            loadModelInfo(),
            loadCityComparison(),
            loadCityPerformance(),
            loadCategoryPerformance()
        ]);

    } catch (error) {
        console.error(
            "Dashboard initialization error:",
            error
        );

        showToast(
            "Dashboard could not initialize. Check the Flask terminal."
        );
    }
}


// ==================================================
// 17. START APPLICATION
// ==================================================

document.addEventListener(
    "DOMContentLoaded",
    initializeDashboard
);
