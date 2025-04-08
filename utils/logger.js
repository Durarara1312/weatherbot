const fs = require('fs');
const path = require('path');
const axios = require('axios'); // Для отправки HTTP-запросов
const config = require('../config');

// Путь к файлу логов
const LOG_FILE_PATH = path.join(__dirname, '../logs/bot.log');

module.exports = {
    /**
     * Логирует информационное сообщение
     * @param {string} message - Сообщение для логирования
     */
    info(message) {
        const logMessage = `[INFO] ${new Date().toISOString()} - ${message}`;
        console.log(logMessage); // Выводим в консоль
        this.writeToFile(logMessage); // Записываем в файл
    },

    /**
     * Логирует предупреждение
     * @param {string} message - Сообщение для логирования
     */
    warn(message) {
        const logMessage = `[WARN] ${new Date().toISOString()} - ${message}`;
        console.warn(logMessage); // Выводим в консоль
        this.writeToFile(logMessage); // Записываем в файл
        this.sendToLoggerBot(logMessage); // Отправляем на локальный сервер логгер-бота
    },

    /**
     * Логирует ошибку
     * @param {string} message - Сообщение для логирования
     * @param {Error} error - Объект ошибки (опционально)
     */
    async error(message, error) {
        const errorMessage = error ? `${message}: ${error.message}` : message;
        const logMessage = `[ERROR] ${new Date().toISOString()} - ${errorMessage}`;
        console.error(logMessage); // Выводим в консоль
        this.writeToFile(logMessage); // Записываем в файл
    
        if (error && error.stack) {
            console.error(error.stack); // Выводим стек вызовов
            this.writeToFile(`Stack trace: ${error.stack}`);
        }
    
        await this.sendToLoggerBot(logMessage); // Отправляем на локальный сервер логгер-бота
    },

    /**
     * Логирует информацию о новом пользователе
     * @param {Object} userData - Данные пользователя
     * @param {number} userData.chatId - ID пользователя Telegram
     * @param {string} userData.username - Username пользователя (если есть)
     * @param {string} userData.firstName - Имя пользователя
     * @param {string} userData.lastName - Фамилия пользователя
     */
    async logNewUser(userData) {
        const { chatId, username, firstName, lastName } = userData;

        // Формируем сообщение о новом пользователе
        const newUserMessage = `Новый пользователь!\nChat ID: ${chatId}\nUsername: @${username || 'не указан'}\nИмя: ${firstName}\nФамилия: ${lastName}`;

        // Логируем в консоль и файл
        const logMessage = `[NEW_USER] ${new Date().toISOString()} - ${newUserMessage}`;
        console.log(logMessage);
        this.writeToFile(logMessage);

        // Отправляем сообщение на логгер-сервер
        try {
            await axios.post('http://localhost:3001/new-user', {
                chatId,
                username,
                firstName,
                lastName
            });

            console.log("Сообщение о новом пользователе успешно отправлено на логгер-сервер.");
        } catch (err) {
            console.error("Не удалось отправить сообщение о новом пользователе на логгер-сервер:", err.message);
        }
    },

    /**
     * Записывает сообщение в файл логов
     * @param {string} message - Сообщение для записи
     */
    writeToFile(message) {
        // Создаем папку logs, если её нет
        const logsDir = path.dirname(LOG_FILE_PATH);
        if (!fs.existsSync(logsDir)) {
            fs.mkdirSync(logsDir, { recursive: true });
        }
        // Добавляем сообщение в файл
        fs.appendFileSync(LOG_FILE_PATH, message + '\n', 'utf8');
    },

    /**
     * Отправляет сообщение на локальный сервер логгер-бота
     * @param {string} message - Сообщение для отправки
     */
    async sendToLoggerBot(message) {
        try {
            await axios.post('http://localhost:3001/log', { message });
            console.log("Сообщение успешно отправлено логгер-боту.");
        } catch (err) {
            console.error("Не удалось отправить сообщение логгер-боту:", err.message);
        }
    }
};