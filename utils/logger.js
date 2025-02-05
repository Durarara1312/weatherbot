const fs = require('fs');
const path = require('path');
const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');

// Путь к файлу логов
const LOG_FILE_PATH = path.join(__dirname, '../logs/bot.log');

// Инициализация Telegram-бота для отправки логов
const logBot = new TelegramBot(config.LOG_BOT_TOKEN);

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
        this.sendToTelegram(logMessage); // Отправляем в Telegram
    },

    /**
     * Логирует ошибку
     * @param {string} message - Сообщение для логирования
     * @param {Error} error - Объект ошибки (опционально)
     */
    error(message, error) {
        const errorMessage = error ? `${message}: ${error.message}` : message;
        const logMessage = `[ERROR] ${new Date().toISOString()} - ${errorMessage}`;
        console.error(logMessage); // Выводим в консоль
        this.writeToFile(logMessage); // Записываем в файл

        if (error && error.stack) {
            console.error(error.stack); // Выводим стек вызовов
            this.writeToFile(`Stack trace: ${error.stack}`);
        }

        this.sendToTelegram(logMessage); // Отправляем в Telegram
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
     * Отправляет сообщение в Telegram-канал
     * @param {string} message - Сообщение для отправки
     */
    sendToTelegram(message) {
        if (!config.LOG_CHANNEL_ID) {
            console.warn("LOG_CHANNEL_ID не указан в конфигурации. Логи не отправлены в Telegram.");
            return;
        }

        logBot.sendMessage(config.LOG_CHANNEL_ID, message, { parse_mode: "Markdown" })
            .catch((err) => {
                console.error("Ошибка при отправке лога в Telegram:", err.message);
            });
    }
};