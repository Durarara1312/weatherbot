const database = require('../database');
const localization = require('../utils/localization');

module.exports = {
    /**
     * Запрашивает у пользователя город
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата пользователя
     */
    async requestCity(bot, chatId) {
        const cityPrompt = await localization.getLocaleText(chatId, 'enter_city_prompt');
        bot.sendMessage(chatId, cityPrompt, { reply_markup: { force_reply: true } });
    },

    /**
     * Обрабатывает ответ пользователя с новым городом
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {Object} msg - Сообщение от пользователя
     */
    async handleNewCity(bot, msg) {
        const chatId = msg.chat.id;
        const city = msg.text;

        // Сохраняем город в базе данных
        database.upsertSubscription(chatId, city, null, null, async (err) => {
            if (err) {
                console.error(err.message);
                const errorMessage = await localization.getLocaleText(chatId, 'city_change_error');
                bot.sendMessage(chatId, errorMessage);
                return;
            }
            const successMessage = await localization.getLocaleText(chatId, 'city_change_success');
            bot.sendMessage(chatId, `${successMessage} ${city}`);

            // Отправляем меню подписки
            const menuHandler = require('./menuHandler');
            menuHandler.sendSubscriptionMenu(bot, chatId);
        });
    }
};