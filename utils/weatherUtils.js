const axios = require('axios');
const config = require('../config');


    /**
     * Получить данные о погоде для указанного города
     * @param {string} city - Город
     * @returns {Object|null} - Данные о погоде или null в случае ошибки
     */
    async function getWeatherByCity(city) {
        try {
            const response = await axios.get(
                `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(city)}&appid=${config.OPENWEATHER_API_KEY}&units=metric&lang=en`
            );

            const data = response.data;

            // Проверяем, что данные содержат необходимые поля
            if (!data || !data.main || !data.weather) {
                throw new Error("Некорректные данные от API");
            }

            return {
                temperature: data.main.temp,
                feels_like: data.main.feels_like,
                humidity: data.main.humidity,
                pressureHpa: data.main.pressure,
                wind_speed: data.wind.speed,
                cloudiness: data.clouds.all,
                visibility: data.visibility / 1000, // Переводим в километры
                sunrise: new Date(data.sys.sunrise * 1000).toLocaleTimeString(),
                sunset: new Date(data.sys.sunset * 1000).toLocaleTimeString(),
                rain: data.rain?.["1h"] || 0,
                snow: data.snow?.["1h"] || 0,
                descriptionKey: data.weather[0].description, // Ключ для локализации
                description: data.weather[0].description // Оригинальное описание
            };
        } catch (error) {
            console.error("Ошибка при получении данных о погоде:", error.message);
            return null;
        }
    }

    /**
     * Получает прогноз погоды через определённое количество часов
     * @param {string} city - Город
     * @param {number} hours - Количество часов (например, 3, 6 или 12)
     * @returns {Promise<Object>} - Прогноз погоды
     */
    async function getFutureWeather(city, hours) {
        const apiKey = 'YOUR_API_KEY'; // Замените на ваш API-ключ
        const url = `https://api.openweathermap.org/data/2.5/forecast?q=${encodeURIComponent(city)}&appid=${config.OPENWEATHER_API_KEY}&units=metric&lang=ru`;

        try {
            const response = await axios.get(url);
            const forecastList = response.data.list;
    
            const now = new Date(); // Текущее время
            const targetTime = new Date(now.getTime() + hours * 60 * 60 * 1000); // Целевое время
    
            // Находим ближайший прогноз к целевому времени
            const forecast = forecastList.find(item => {
                const itemTime = new Date(item.dt_txt);
                return Math.abs(itemTime - targetTime) < 1.5 * 60 * 60 * 1000; // ±1.5 часа
            });
    
            if (!forecast) {
                throw new Error("Прогноз для указанного времени недоступен.");
            }

            // Форматируем данные
            return {
                temperature: forecast.main.temp,
                feels_like: forecast.main.feels_like, // Ощущаемая температура
                pressureHpa: forecast.main.pressure, // Давление
                humidity: forecast.main.humidity,    // Влажность
                wind_speed: forecast.wind.speed,    // Скорость ветра
                cloudiness: forecast.clouds.all,    // Облачность
                visibility: forecast.visibility,    // Видимость (в метрах)
                pop: forecast.pop,                  // Вероятность осадков
                description: forecast.weather[0].description, // Описание погоды
                icon: forecast.weather[0].icon,     // Иконка погоды
                time: forecast.dt_txt              // Время прогноза
            };
        } catch (error) {
            console.error(`[ERROR] Не удалось получить прогноз для города ${city}:`, error.message);
            throw error;
        }
    
    }

    module.exports = {
        getFutureWeather,
        getWeatherByCity
    };

