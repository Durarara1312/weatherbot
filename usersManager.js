const fs = require('fs');
const path = require('path');
const database = require('./database'); // Импортируем базу данных
const {
    getTemperatureUnitLabel,
    getPressureUnitLabel,
    getWindSpeedUnitLabel
} = require('./utils/formatting');

module.exports = {

    /**
     * Очищает юзернейм от лишних escape-символов
     * @param {string} username - Исходный юзернейм
     * @returns {string} - Очищенный юзернейм
     */
    sanitizeUsername(username) {
        if (!username) return 'Не указан';
        // Удаляем все обратные слеши и оставляем только допустимые символы
        return username.replace(/\\/g, '').replace(/[^a-zA-Z0-9_]/g, '');
    },

    /**
     * Экранирует специальные символы для Markdown
     * @param {string} text - Текст для экранирования
     * @returns {string} - Экранированный текст
     */
        escapeMarkdown(text) {
            return text.replace(/[_*[\]()~`>#+-=|{}.!]/g, '\\$&');
        },

    /**
     * Отправляет список пользователей администратору с разбиением на страницы
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата администратора
     */
    sendUsersList(bot, chatId) {
        database.getAllUsers(async (err, rows) => {
            if (err) {
                console.error("[ERROR] Ошибка при получении списка пользователей:", err.message);
                bot.sendMessage(chatId, "❌ Произошла ошибка при получении списка пользователей.");
                return;
            }
            if (rows.length === 0) {
                bot.sendMessage(chatId, "⚠️ Список пользователей пуст.");
                return;
            }

            // Разбиваем пользователей на страницы (по 5 на страницу)
            const pageSize = 5;
            let currentPage = 0;
            let currentMessageId = null; // ID текущего сообщения

            const sendPage = async (page) => {
                const start = page * pageSize;
                const end = Math.min(start + pageSize, rows.length); // Конец диапазона записей
                const users = rows.slice(start, end);

                if (users.length === 0) {
                    bot.sendMessage(chatId, "⚠️ Нет данных для отображения на этой странице.");
                    return;
                }

                // Формируем заголовок с общим количеством пользователей и диапазоном записей
                const totalUsers = rows.length;
                const rangeStart = start + 1;
                const rangeEnd = end;

                let message = `📊 *Список пользователей (${rangeStart}–${rangeEnd} из ${totalUsers}):*\n`;

                // Добавляем информацию о пользователях
                users.forEach((row, index) => {
                    const username = row.username ? `@${this.escapeMarkdown(row.username)}` : 'Не указан';
                    const subscriptionDate = row.subscription_start || 'Не указано';
                    const city = row.city || 'Не установлен';
                    const time = row.time || 'Не установлено';
                    const language = row.language || 'Не указан';
                    const status = row.status || 'inactive';

                    // Устанавливаем значения по умолчанию, если настройки отсутствуют
                    const temperatureUnit = getTemperatureUnitLabel(row.temperature_unit, language) || '°C';
                    const pressureUnit = getPressureUnitLabel(row.pressure_unit, language) || 'мм рт. ст.';
                    const windSpeedUnit = getWindSpeedUnitLabel(row.wind_speed_unit, language) || 'км/ч';

                    message += `
    [${start + index + 1}]  
    • Chat ID: ${row.chat_id}
    • Дата подписки: ${subscriptionDate}
    • Username: ${username}
    • Город: ${city}
    • Время рассылки: ${time}
    • Язык: ${language}
    • Статус подписки: ${status}
    • Единицы измерения:
    - Температура: ${temperatureUnit}
    - Давление: ${pressureUnit}
    - Скорость ветра: ${windSpeedUnit}
    ---
    `;
            });

            // Создаем клавиатуру для навигации
            const keyboard = {
                reply_markup: {
                    inline_keyboard: [
                        [
                            { text: "⬅️ Предыдущая", callback_data: `users_page_${page - 1}` },
                            { text: "➡️ Следующая", callback_data: `users_page_${page + 1}` }
                        ]
                    ]
                }
            };

            // Удаляем предыдущее сообщение, если оно существует
            if (currentMessageId) {
                try {
                    await bot.deleteMessage(chatId, currentMessageId);
                } catch (error) {
                    console.warn(`[WARN] Не удалось удалить сообщение с ID ${currentMessageId}:`, error.message);
                }
            }

            // Отправляем новое сообщение
            try {
                const sentMessage = await bot.sendMessage(chatId, message, { parse_mode: "Markdown", ...keyboard });
                currentMessageId = sentMessage.message_id; // Сохраняем ID нового сообщения
            } catch (error) {
                console.error(`[ERROR] Ошибка при отправке сообщения: ${error.message}`);
                bot.sendMessage(chatId, "❌ Произошла ошибка при отправке списка пользователей.");
            }
        };

        // Отправляем первую страницу
        sendPage(currentPage);

        // Обрабатываем нажатия на кнопки навигации
        bot.on("callback_query", (query) => {
            const data = query.data;
            if (data.startsWith("users_page_")) {
                const page = parseInt(data.split("_")[2]);
                if (page >= 0 && page * pageSize < rows.length) {
                    sendPage(page);
                } else {
                    bot.answerCallbackQuery(query.id, "⚠️ Нет данных для отображения на этой странице.");
                }
            }
        });
    });
},


    /**
     * Экспортирует список пользователей в CSV-файл
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата администратора
     */
    exportUsersToCSV(bot, chatId) {
        database.getAllUsers(async (err, rows) => {
            if (err) {
                console.error("[ERROR] Ошибка при получении списка пользователей:", err.message);
                bot.sendMessage(chatId, "❌ Произошла ошибка при получении списка пользователей.");
                return;
            }
            if (rows.length === 0) {
                bot.sendMessage(chatId, "⚠️ Список пользователей пуст.");
                return;
            }

            // Формируем CSV-файл
            const csvData = [
                [
                    "Chat ID",
                    "Дата подписки",
                    "Username",
                    "Город",
                    "Время рассылки",
                    "Язык",
                    "Статус подписки",
                    "Температура",
                    "Давление",
                    "Скорость ветра"
                ],
                ...rows.map(row => {
                    const username = this.sanitizeUsername(row.username); // Очищаем юзернейм
                    const subscriptionDate = row.subscription_start || 'Не указано';
                    const city = row.city || 'Не установлен';
                    const time = row.time || 'Не установлено';
                    const language = row.language || 'Не указан';
                    const status = row.status || 'inactive';

                    // Локализованные метки для единиц измерения
                    const temperatureUnit = getTemperatureUnitLabel(row.temperature_unit, language) || '°C';
                    const pressureUnit = getPressureUnitLabel(row.pressure_unit, language) || 'мм рт. ст.';
                    const windSpeedUnit = getWindSpeedUnitLabel(row.wind_speed_unit, language) || 'км/ч';

                    return [
                        row.chat_id,
                        subscriptionDate,
                        username,
                        city,
                        time,
                        language,
                        status,
                        temperatureUnit,
                        pressureUnit,
                        windSpeedUnit
                    ];
                })
            ].map(row => row.join(",")).join("\n");

            // Создаем файл с BOM для корректного отображения в Excel
            const filePath = path.join(__dirname, 'users.csv');
            const bom = '\uFEFF'; // Добавляем BOM для UTF-8
            try {
                fs.writeFileSync(filePath, bom + csvData);

                // Проверяем существование файла
                if (!fs.existsSync(filePath)) {
                    bot.sendMessage(chatId, "❌ Произошла ошибка при создании файла.");
                    return;
                }

                // Отправляем файл администратору
                await bot.sendDocument(chatId, filePath, {}, { caption: "📊 Список пользователей в формате CSV." });

                // Удаляем временный файл
                fs.unlinkSync(filePath);
            } catch (error) {
                console.error("[ERROR] Ошибка при экспорте данных:", error.message);
                bot.sendMessage(chatId, "❌ Произошла ошибка при экспорте данных.");
            }
        });
    },

    /**
     * Фильтрует пользователей по заданным параметрам
     * @param {TelegramBot} bot - Экземпляр Telegram-бота
     * @param {number} chatId - ID чата администратора
     * @param {string} filterParams - Параметры фильтрации (например, "city=Москва&status=active")
     */
    filterUsers(bot, chatId, filterParams) {
        const filters = {};
        filterParams.split("&").forEach(param => {
            const [key, value] = param.split("=");
            filters[key] = value;
        });

        database.getAllUsers((err, rows) => {
            if (err) {
                console.error("[ERROR] Ошибка при получении списка пользователей:", err.message);
                bot.sendMessage(chatId, "❌ Произошла ошибка при получении списка пользователей.");
                return;
            }

            // Фильтруем пользователей
            const filteredUsers = rows.filter(row => {
                return Object.keys(filters).every(key => {
                    return String(row[key]).toLowerCase() === String(filters[key]).toLowerCase();
                });
            });

            if (filteredUsers.length === 0) {
                bot.sendMessage(chatId, "⚠️ Нет пользователей, соответствующих заданным фильтрам.");
                return;
            }

            // Формируем сообщение со списком пользователей
            let message = "📊 *Список пользователей (отфильтрованный):*\n";

            filteredUsers.forEach((row, index) => {
                const username = this.sanitizeUsername(row.username); // Очищаем юзернейм
                const subscriptionDate = row.subscription_date ? row.subscription_date : 'Не указано';
                const city = row.city || 'Не установлен';
                const time = row.time || 'Не установлено';
                const language = row.language || 'Не указан';
                const status = row.status || 'inactive';

                // Устанавливаем значения по умолчанию, если настройки отсутствуют
                const temperatureUnit = getTemperatureUnitLabel(row.temperature_unit, language) || '°C';
                const pressureUnit = getPressureUnitLabel(row.pressure_unit, language) || 'мм рт. ст.';
                const windSpeedUnit = getWindSpeedUnitLabel(row.wind_speed_unit, language) || 'км/ч';

                message += `
[${index + 1}]  
• Chat ID: ${row.chat_id}
• Дата подписки: ${subscriptionDate}
• Username: @${username}
• Город: ${city}
• Время рассылки: ${time}
• Язык: ${language}
• Статус подписки: ${status}
• Единицы измерения:
  - Температура: ${temperatureUnit}
  - Давление: ${pressureUnit}
  - Скорость ветра: ${windSpeedUnit}
-------------------
`;
            });

            // Отправляем сообщение администратору
            bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
        });
    },



};