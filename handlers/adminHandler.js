const TelegramBot = require('node-telegram-bot-api');
const database = require('../database');
const localization = require('../utils/localization');
const models = require('../models');

module.exports = {
    /**
     * Проверяет, является ли пользователь администратором
     * @param {number} chatId - ID чата пользователя
     * @returns {Promise<boolean>} - true, если пользователь администратор
     */
    async isAdmin(chatId) {
        const adminChatId = process.env.ADMIN_CHAT_ID || require('../config').ADMIN_CHAT_ID;
        return chatId == adminChatId; // Сравниваем ID пользователя с ID администратора
    },

    /**
     * Обрабатывает команду /stats
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {Object} msg - Сообщение от Telegram
     */
    async handleStatsCommand(bot, msg) {
        const chatId = msg.chat.id;

        if (!(await this.isAdmin(chatId))) {
            const errorMessage = await localization.getLocaleText(chatId, 'admin_only_command');
            bot.sendMessage(chatId, errorMessage);
            return;
        }

        // Получаем общее количество пользователей
        database.getTotalUsers(async (err, totalUsers) => {
            if (err) {
                console.error(err.message);
                bot.sendMessage(chatId, "❌ Произошла ошибка при получении статистики.");
                return;
            }

            // Формируем сообщение со статистикой
            const statsMessage = await localization.getLocaleText(chatId, 'stats_message');
            bot.sendMessage(chatId, statsMessage.replace("{total_users}", totalUsers));
        });
    },

    /**
     * Обрабатывает команду /broadcast
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {Object} msg - Сообщение от Telegram
     */
    async handleBroadcastCommand(bot, msg) {
        const chatId = msg.chat.id;

        if (!(await this.isAdmin(chatId))) {
            const errorMessage = await localization.getLocaleText(chatId, 'admin_only_command');
            bot.sendMessage(chatId, errorMessage);
            return;
        }

        const broadcastPrompt = await localization.getLocaleText(chatId, 'broadcast_prompt');
        bot.sendMessage(chatId, broadcastPrompt, { reply_markup: { force_reply: true } });

        bot.onReplyToMessage(chatId, async (replyMsg) => {
            const messageText = replyMsg.text;

            // Получаем всех пользователей из базы данных
            database.getAllUsers(async (err, rows) => {
                if (err) {
                    console.error(err.message);
                    bot.sendMessage(chatId, "❌ Произошла ошибка при получении списка пользователей.");
                    return;
                }

                let successCount = 0;
                let errorCount = 0;

                for (const row of rows) {
                    try {
                        await bot.sendMessage(row.chat_id, messageText);
                        successCount++;
                    } catch (error) {
                        console.error(`Ошибка при отправке сообщения пользователю ${row.chat_id}:`, error.message);
                        errorCount++;
                    }
                }

                const broadcastResult = await localization.getLocaleText(chatId, 'broadcast_result');
                bot.sendMessage(
                    chatId,
                    broadcastResult
                        .replace("{success_count}", successCount)
                        .replace("{error_count}", errorCount)
                );
            });
        });
    }
};