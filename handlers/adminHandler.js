const TelegramBot = require('node-telegram-bot-api');
const database = require('../database');
const localization = require('../utils/localization');
const models = require('../models');
const usersManager = require('../usersManager');
const config = require('../config');

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

    async sendUsersList(bot, chatId) {
        if (chatId !== config.ADMIN_CHAT_ID) {
            bot.sendMessage(chatId, "❌ Эта команда доступна только администратору.");
            return;
        }
        usersManager.sendUsersList(bot, chatId);
    },

    /**
     * Экспортирует список пользователей в CSV-файл
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата администратора
     */
    async exportUsersToCSV(bot, chatId) {
        if (chatId !== config.ADMIN_CHAT_ID) {
            bot.sendMessage(chatId, "❌ Эта команда доступна только администратору.");
            return;
        }
        usersManager.exportUsersToCSV(bot, chatId);
    },

    /**
     * Фильтрует пользователей по заданным параметрам
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата администратора
     * @param {string} filterParams - Параметры фильтрации (например, "city=Москва&status=active")
     */
    async filterUsers(bot, chatId, filterParams) {
        if (chatId !== config.ADMIN_CHAT_ID) {
            bot.sendMessage(chatId, "❌ Эта команда доступна только администратору.");
            return;
        }
        usersManager.filterUsers(bot, chatId, filterParams);
    },

    /**
     * Обрабатывает callback-запросы для админ-панели
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {Object} query - CallbackQuery объект
     */
    handleAdminPanel(bot, query) {
        const chatId = query.message.chat.id;
        const data = query.data;

        switch (data) {
            case 'admin_users_list':
                this.sendUsersList(bot, chatId);
                break;

            case 'admin_export_users':
                this.exportUsersToCSV(bot, chatId);
                break;

            case 'admin_filter_users':
                bot.sendMessage(chatId, "Введите параметры фильтрации в формате: city=Москва&status=active");
                break;

            default:
                bot.sendMessage(chatId, "Неизвестная команда.");
                break;
        }
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
            const statsMessage = await localization.getLocaleText(chatId, 'usage_stats');
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