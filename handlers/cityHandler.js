const database = require('../database');
const localization = require('../utils/localization');
const logger = require('../utils/logger');


module.exports = {
/**
 * Запрашивает у пользователя город
 * @param {TelegramBot} bot - Экземпляр Telegram-бота
 * @param {number} chatId - ID чата пользователя
 */
async requestCity(bot, chatId) {
    const cityPrompt = await localization.getLocaleText(chatId, 'enter_city_prompt');
    // Устанавливаем состояние ожидания города в базе данных
    database.setState(chatId, 'waiting_for_city', (err) => {
        if (err) {
            console.error(`Ошибка при установке состояния для chatId ${chatId}:`, err.message);
            return;
        }
        bot.sendMessage(chatId, cityPrompt, { reply_markup: { force_reply: true } });
    });
},

/**
 * Обрабатывает ответ пользователя с новым городом
 * @param {TelegramBot} bot - Экземпляр Telegram-бота
 * @param {Object} msg - Сообщение от пользователя
 */
async handleNewCity(bot, msg) {
    const chatId = msg.chat.id;

    try {
        // Получаем состояние пользователя из базы данных
        database.getState(chatId, async (err, row) => {
            if (err) {
                console.error(`Ошибка при получении состояния для chatId ${chatId}:`, err.message);
                return;
            }

            const currentState = row?.state;
            if (currentState !== 'waiting_for_city') {
                return; // Игнорируем сообщение, если оно не связано с городом
            }

            const city = msg.text;

            // Проверка, что город не пустой
            if (!city.trim()) {
                const invalidCityError = (await localization.getLocaleText(chatId, 'city_not_set_error')) || "Город не может быть пустым!";
                bot.sendMessage(chatId, invalidCityError);
                return;
            }

            console.log(`[DEBUG] Обработка нового города для chatId ${chatId}: ${city}`);

            // Обновляем город в базе данных
            database.updateCity(chatId, city, async (err) => {
                if (err) {
                    console.error(`Ошибка при сохранении города для chatId ${chatId}:`, err.message);
                    const errorMessage = (await localization.getLocaleText(chatId, 'city_change_error')) || "Произошла ошибка при изменении города.";
                    bot.sendMessage(chatId, errorMessage);
                    return;
                }

                console.log(`[DEBUG] Город успешно сохранён для chatId ${chatId}`);

                // Увеличиваем счётчик изменений города
                database.incrementCityChanges(chatId, (err) => {
                    if (err) {
                        console.error(`Ошибка при увеличении счётчика изменений города для chatId ${chatId}:`, err.message);
                    }
                });

                const successMessage = (await localization.getLocaleText(chatId, 'city_change_success')) || "Город успешно изменён!";
                bot.sendMessage(chatId, `${successMessage} ${city}`);

                // Очищаем состояние
                database.clearState(chatId, (err) => {
                    if (err) {
                        console.error(`Ошибка при очистке состояния для chatId ${chatId}:`, err.message);
                    }
                });

                // Отправляем меню подписки после изменения города
                try {
                    const menuHandler = require('./menuHandler');
                    menuHandler.sendSubscriptionMenu(bot, chatId);
                } catch (error) {
                    console.error(`Ошибка при отправке меню подписки для chatId ${chatId}:`, error.message);
                }
            });
        });
    } catch (error) {
        console.error(`Неожиданная ошибка при обработке нового города для chatId ${chatId}:`, error.message);
        const errorMessage = (await localization.getLocaleText(chatId, 'general_error')) || "Произошла непредвиденная ошибка.";
        bot.sendMessage(chatId, errorMessage);
    }
}
};