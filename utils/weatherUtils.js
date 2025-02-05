const axios = require('axios');
const config = require('../config');

module.exports = {
    /**
     * Получить данные о погоде для указанного города
     * @param {string} city - Город
     * @returns {Object|null} - Данные о погоде или null в случае ошибки
     */
    async getWeatherByCity(city) {
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
};