const database = require('../database');
const localization = require('../utils/localization');
const logger = require('../utils/logger');
const models = require('../models');


module.exports = {
/**
 * Запрашивает у пользователя новое время рассылки
 * @param {TelegramBot} bot - Экземпляр Telegram-бота
 * @param {number} chatId - ID чата пользователя
 */
async requestNewTime(bot, chatId) {
    const timePrompt = await localization.getLocaleText(chatId, 'enter_time_prompt');
    // Устанавливаем состояние ожидания времени в базе данных
    database.setState(chatId, 'waiting_for_time', (err) => {
        if (err) {
            console.error(`Ошибка при установке состояния для chatId ${chatId}:`, err.message);
            return;
        }
        bot.sendMessage(chatId, timePrompt, { reply_markup: { force_reply: true } });
    });
},

/**
 * Обрабатывает ответ пользователя с новым временем
 * @param {TelegramBot} bot - Экземпляр Telegram-бота
 * @param {Object} msg - Сообщение от пользователя
 */
async handleNewTime(bot, msg) {
    const chatId = msg.chat.id;

    try {
        // Увеличиваем счётчик изменений времени
        database.incrementTimeChanges(chatId, (err) => {
            if (err) {
                console.error(`Ошибка при увеличении счётчика изменений времени для chatId ${chatId}:`, err.message);
            }
        });

        // Получаем состояние пользователя из базы данных
        database.getState(chatId, async (err, row) => {
            if (err) {
                console.error(`Ошибка при получении состояния для chatId ${chatId}:`, err.message);
                return;
            }

            const currentState = row?.state;
            if (currentState !== 'waiting_for_time') {
                return; // Игнорируем сообщение, если оно не связано с временем
            }

            const time = msg.text;

            // Проверка формата времени (HH:MM)
            const timeRegex = /^([01]?\d|2[0-3]):([0-5]?\d)$/;
            if (!timeRegex.test(time)) {
                const invalidTimeError = (await localization.getLocaleText(chatId, 'invalid_time_format_error')) || "Неверный формат времени!";
                bot.sendMessage(chatId, `${invalidTimeError} HH:MM`);
                return;
            }

            console.log(`[DEBUG] Обработка нового времени для chatId ${chatId}: ${time}`);

            // Обновляем время в базе данных
            database.updateTime(chatId, time, async (err) => {
                if (err) {
                    console.error(`Ошибка при сохранении времени для chatId ${chatId}:`, err.message);
                    const errorMessage = (await localization.getLocaleText(chatId, 'time_change_error')) || "Произошла ошибка при изменении времени.";
                    bot.sendMessage(chatId, errorMessage);
                    return;
                }

                console.log(`[DEBUG] Время успешно сохранено для chatId ${chatId}`);

                const successMessage = (await localization.getLocaleText(chatId, 'time_change_success')) || "Время успешно изменено!";
                bot.sendMessage(chatId, `${successMessage} ${time}`);

                // Очищаем состояние
                database.clearState(chatId, (err) => {
                    if (err) {
                        console.error(`Ошибка при очистке состояния для chatId ${chatId}:`, err.message);
                    }
                });

                // Отправляем главное меню после изменения времени
                try {
                    const menuHandler = require('./menuHandler');
                    menuHandler.sendMainMenu(bot, chatId);
                } catch (error) {
                    console.error(`Ошибка при отправке главного меню для chatId ${chatId}:`, error.message);
                }
            });
        });
    } catch (error) {
        console.error(`Неожиданная ошибка при обработке нового времени для chatId ${chatId}:`, error.message);
        const errorMessage = (await localization.getLocaleText(chatId, 'general_error')) || "Произошла непредвиденная ошибка.";
        bot.sendMessage(chatId, errorMessage);
    }
}
};