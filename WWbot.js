const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');
const fs = require('fs');
// Замените YOUR_TELEGRAM_BOT_TOKEN на ваш токен от @BotFather
const token = '1808958052:AAHAwyrqb7y5_sM2jvQP1ypJ-t3r6qWNAm4';

// ID администратора (замените на ваш chat_id)
const ADMIN_CHAT_ID = 653104212; // Укажите ваш chat_id здесь

// Создаем бота
const bot = new TelegramBot(token, { polling: true });

// Подключаемся к базе данных SQLite
const db = new sqlite3.Database('./weather_bot.db');

// Объект для отслеживания состояния ожидания ответа от пользователей
const userStates = {};

// Создаем таблицы для хранения подписок и статистики
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS subscriptions (
        chat_id INTEGER PRIMARY KEY,
        city TEXT,
        time TEXT,
        timezone TEXT,
        subscription_start DATE DEFAULT (date('now')),
        language TEXT DEFAULT 'en'
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS user_stats (
        chat_id INTEGER PRIMARY KEY,
        total_requests INTEGER DEFAULT 0,
        weather_requests INTEGER DEFAULT 0,
        city_changes INTEGER DEFAULT 0,
        time_changes INTEGER DEFAULT 0
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS weather_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id INTEGER,
        city TEXT,
        temperature REAL,
        humidity INTEGER,
        description TEXT,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Загружаем языковые файлы
const languages = {
    en: JSON.parse(fs.readFileSync('./locales/en.json', 'utf8')),
    ru: JSON.parse(fs.readFileSync('./locales/ru.json', 'utf8'))
};

// Функция для получения текста на нужном языке
async function getLocaleText(chatId, key) {
    const userLanguage = await getUserLanguage(chatId); // Получаем язык из базы данных
    const text = languages[userLanguage]?.[key] || languages['en']?.[key] || `Key "${key}" not found`;
    if (!languages[userLanguage]?.[key]) {
        console.error(`Текст для ключа "${key}" на языке "${userLanguage}" не найден.`);
    }
    return text;
}

async function getUserLanguage(chatId) {
    return new Promise((resolve, reject) => {
        db.get("SELECT language FROM subscriptions WHERE chat_id = ?", [chatId], (err, row) => {
            if (err) {
                console.error(`Ошибка при получении языка для chatId ${chatId}:`, err.message);
                return resolve('en'); // Возвращаем язык по умолчанию
            }
            resolve(row?.language || 'en');
        });
    });
}

// Объект для хранения message_id последнего меню
const lastMenuMessageId = {};

// Inline keyboard markup для меню
async function getMainMenuKeyboard(chatId) {
    const subscribeButton = await getLocaleText(chatId, 'subscribe_button');
    const actionsButton = await getLocaleText(chatId, 'actions_menu');
    const changeLanguageButton = await getLocaleText(chatId, 'change_language_button');
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: subscribeButton, callback_data: 'subscription_menu' }],
                [{ text: actionsButton, callback_data: 'actions_menu' }],
                [{ text: changeLanguageButton, callback_data: 'change_language' }]
            ]
        }
    };
}

async function getSubscriptionMenuKeyboard(chatId) {
    const subscribeButton = await getLocaleText(chatId, 'subscribe_button');
    const changeCityButton = await getLocaleText(chatId, 'change_city_button');
    const changeTimeButton = await getLocaleText(chatId, 'change_time_button');
    const unsubscribeButton = await getLocaleText(chatId, 'unsubscribe_button');
    const backButton = await getLocaleText(chatId, 'back_to_main_menu');
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: subscribeButton, callback_data: 'subscribe' }],
                [{ text: changeCityButton, callback_data: 'change_city' }],
                [{ text: changeTimeButton, callback_data: 'change_time' }],
                [{ text: unsubscribeButton, callback_data: 'unsubscribe' }],
                [{ text: backButton, callback_data: 'back_to_main_menu' }]
            ]
        }
    };
}

async function getActionsMenuKeyboard(chatId) {
    const currentWeatherButton = await getLocaleText(chatId, 'current_weather_button');
    const statsButton = await getLocaleText(chatId, 'stats_button');
    const feedbackButton = await getLocaleText(chatId, 'feedback_button');
    const backButton = await getLocaleText(chatId, 'back_to_main_menu');
    return {
        reply_markup: {
            inline_keyboard: [
                [{ text: currentWeatherButton, callback_data: 'current_weather' }],
                [{ text: statsButton, callback_data: 'stats' }],
                [{ text: feedbackButton, callback_data: 'feedback' }],
                [{ text: backButton, callback_data: 'back_to_main_menu' }]
            ]
        }
    };
}

// Отправляем сообщение с меню
async function sendMenu(chatId, keyboardFunction = null) {
    let keyboard = {};
    if (keyboardFunction && typeof keyboardFunction === 'function') {
        try {
            keyboard = await keyboardFunction(chatId); // Передаем chatId для получения актуального языка
        } catch (error) {
            console.error("Ошибка при формировании клавиатуры:", error.message);
        }
    }

    // Удаляем старое сообщение, если оно существует
    if (lastMenuMessageId[chatId]) {
        try {
            await bot.deleteMessage(chatId, lastMenuMessageId[chatId]);
        } catch (error) {
            console.error(`Ошибка при удалении сообщения ${lastMenuMessageId[chatId]}:`, error.message);
        }
    }

    // Отправляем новое сообщение
    const sentMessage = await bot.sendMessage(
        chatId,
        await getLocaleText(chatId, 'main_menu'),
        keyboard
    );

    // Сохраняем ID нового сообщения
    lastMenuMessageId[chatId] = sentMessage.message_id;
}

// Функция для получения данных о погоде через API OpenWeatherMap
async function getWeatherByCity(city) {
    try {
        const response = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=3cea34b26dd41310d93283c98b8d2903&units=metric&lang=ru`);
        if (!response.ok) {
            throw new Error("Ошибка при запросе к API");
        }
        const data = await response.json();


        // Конвертируем давление из гПа в мм рт. ст.
        const pressureHpa = data.main.pressure;
        const pressureMmHg = (pressureHpa * 0.750062).toFixed(0); // Округляем до целого числа


        return {
            temperature: data.main.temp,
            feels_like: data.main.feels_like,
            humidity: data.main.humidity,
            pressureHpa: pressureHpa, // Давление в гПа
            pressureMmHg: pressureMmHg, // Давление в мм рт. ст.
            wind_speed: data.wind.speed,
            cloudiness: data.clouds.all,
            visibility: data.visibility / 1000, // Переводим в километры
            sunrise: new Date(data.sys.sunrise * 1000).toLocaleTimeString(),
            sunset: new Date(data.sys.sunset * 1000).toLocaleTimeString(),
            rain: data.rain?.["1h"] || 0,
            snow: data.snow?.["1h"] || 0,
            descriptionKey: data.weather[0].main.toLowerCase(),  // Ключ для локализации
            description: data.weather[0].description // Оригинальное описание (на случай отсутствия ключа)
        };
    } catch (error) {
        console.error("Ошибка при получении данных о погоде:", error.message);
        return null;
    }
}

// Функция для отправки погоды пользователям в заданное время
function sendWeatherAtScheduledTimes() {
    const now = new Date();
    const currentHour = String(now.getHours()).padStart(2, '0');
    const currentMinute = String(now.getMinutes()).padStart(2, '0');
    const currentTime = `${currentHour}:${currentMinute}`;

    db.each("SELECT * FROM subscriptions", async (err, row) => {
        if (err) {
            return console.error(err.message);
        }

        // Проверяем, совпадает ли время рассылки с текущим временем
        if (row.time === currentTime) {
            const chatId = row.chat_id; // Убедитесь, что chatId извлекается из базы данных
            const city = row.city;

            // Получаем данные о погоде
            const weatherData = await getWeatherByCity(city);

            if (!weatherData) {
                const errorMessage = await getLocaleText(chatId, 'weather_fetch_error');
                bot.sendMessage(chatId, `${errorMessage} ${city}.`);
                return;
            }

            // Форматируем сообщение
            const message = await formatWeatherMessage({ ...weatherData, chatId }, city); // Передаем chatId

            // Логируем отправку сообщения
            console.log(`Отправляем сообщение для chatId ${chatId}:`, message);

            // Отправляем сообщение пользователю
            bot.sendMessage(chatId, message, { parse_mode: "Markdown" });

            // Логируем погодные данные в базу данных
            db.run(
                "INSERT INTO weather_history (chat_id, city, temperature, humidity, description) VALUES (?, ?, ?, ?, ?)",
                [
                    chatId,
                    city,
                    weatherData.temperature,
                    weatherData.humidity,
                    weatherData.description
                ],
                (err) => {
                    if (err) {
                        console.error(`Ошибка при записи в базу данных для chatId ${chatId}:`, err.message);
                    }
                }
            );
        }
    });
}

// Функция для форматирования сообщения о погоде
async function formatWeatherMessage(weatherData, city) {
    const chatId = weatherData.chatId; // Если chatId доступен в данных
    if (!chatId) {
        console.error("chatId не определен в weatherData");
        return "❌ Произошла ошибка при форматировании сообщения.";
    }

    const template = await getLocaleText(chatId, 'weather_template');

    // Получаем локализованные описания погоды
    const localizedDescriptions = await getLocaleText(chatId, 'weather_descriptions');
    const localizedDescription = localizedDescriptions[weatherData.descriptionKey] || weatherData.description;
    // Форматируем данные
    const formattedMessage = template
        .replace("{city}", city)
        .replace("{temperature}", weatherData.temperature.toFixed(1))
        .replace("{feels_like}", weatherData.feels_like.toFixed(1))
        .replace("{humidity}", weatherData.humidity)
        .replace("{pressure}", weatherData.pressure)
        .replace("{wind_speed}", weatherData.wind_speed.toFixed(2))
        .replace("{cloudiness}", weatherData.cloudiness)
        .replace("{visibility}", weatherData.visibility.toFixed(1))
        .replace("{sunrise}", weatherData.sunrise)
        .replace("{sunset}", weatherData.sunset)
        .replace("{rain}", weatherData.rain || 0)
        .replace("{snow}", weatherData.snow || 0)
        .replace("{description}", localizedDescription);

    console.log(`Сформированное сообщение для chatId ${chatId}:`, formattedMessage);
    return formattedMessage;
}

// Планировщик задач для проверки времени каждую минуту
cron.schedule('* * * * *', () => {
    console.log('Проверка времени для отправки погоды...');
    sendWeatherAtScheduledTimes();
});

// Обработчик команды /start
bot.onText(/\/start/, async (msg) => {
    const chatId = parseInt(msg.chat.id, 10);
    const firstName = msg.chat.first_name || "User";
    const userLanguage = msg.from.language_code || 'en';
    // Устанавливаем язык по умолчанию (например, на основе локали Telegram)

    db.run(
        "INSERT INTO subscriptions (chat_id, language) VALUES (?, ?) ON CONFLICT(chat_id) DO UPDATE SET language = excluded.language",
        [chatId, userLanguage]
    );

    // Получаем приветственное сообщение
    const welcomeMessage = (await getLocaleText(chatId, 'welcome_message')) || "Welcome!";
    const welcomeMessage2 = (await getLocaleText(chatId, 'welcome_message2')) || "Use /start to begin.";
    bot.sendMessage(chatId, `${welcomeMessage}, ${firstName}!\n${welcomeMessage2}`);
    sendMenu(chatId, getMainMenuKeyboard);
});

// Обработчик команды /users (только для администратора)
bot.onText(/\/users/, (msg) => {
    const chatId = parseInt(msg.chat.id, 10);

    // Проверяем, является ли пользователь администратором
    if (chatId !== ADMIN_CHAT_ID) {
        bot.sendMessage(chatId, "❌ Эта команда доступна только администратору.");
        return;
    }

    // Получаем список всех пользователей
    db.all("SELECT * FROM subscriptions", async (err, rows) => {
        if (err) {
            return console.error(err.message);
        }
        if (rows.length === 0) {
            bot.sendMessage(chatId, "Нет активных пользователей.");
            return;
        }

        let message = "📊 Список пользователей:\n";
        for (const row of rows) {
            try {
                const user = await bot.getChat(row.chat_id);
                const username = user.username ? `@${user.username}` : user.first_name || "Неизвестный";
                const city = row.city || "не установлен";
                const time = row.time || "не установлено";
                message += `\n• ${username} / ${user.id}\nГород: ${city}\nВремя: ${time}\n`;
            } catch (error) {
                console.error(`Ошибка при получении данных пользователя с ID ${row.chat_id}:`, error.message);
                message += `\n• Пользователь с ID ${row.chat_id} (данные недоступны)\n`;
            }
        }
        bot.sendMessage(chatId, message);
    });
});

// Обработчик команды /broadcast (только для администратора)
bot.onText(/\/broadcast/, (msg) => {
    const chatId = parseInt(msg.chat.id, 10);

    // Проверяем, является ли пользователь администратором
    if (chatId !== ADMIN_CHAT_ID) {
        bot.sendMessage(chatId, "❌ Эта команда доступна только администратору.");
        return;
    }

    // Запрашиваем текст для рассылки
    bot.sendMessage(chatId, "Введите текст для рассылки:");
    bot.once('message', (msgText) => {
        const broadcastMessage = msgText.text;

        // Получаем список всех подписанных пользователей
        db.all("SELECT chat_id FROM subscriptions", (err, rows) => {
            if (err) {
                console.error(err.message);
                bot.sendMessage(chatId, "❌ Произошла ошибка при получении списка пользователей.");
                return;
            }
            if (rows.length === 0) {
                bot.sendMessage(chatId, "❌ Нет подписанных пользователей.");
                return;
            }

            let successCount = 0;
            let errorCount = 0;

            // Отправляем сообщение каждому пользователю
            rows.forEach((row) => {
                const userChatId = row.chat_id;
                bot.sendMessage(userChatId, broadcastMessage)
                    .then(() => {
                        successCount++;
                    })
                    .catch((error) => {
                        console.error(`Ошибка при отправке сообщения пользователю ${userChatId}:`, error.message);
                        errorCount++;
                    })
                    .finally(() => {
                        // Если все сообщения отправлены, отправляем отчет администратору
                        if (successCount + errorCount === rows.length) {
                            bot.sendMessage(
                                chatId,
                                `✅ Рассылка завершена.\nУспешно отправлено: ${successCount}\nОшибок: ${errorCount}`
                            );
                        }
                    });
            });
        });
    });
});

// Обработчик команды /sendmessage (только для администратора)
bot.onText(/\/sendmessage/, (msg) => {
    const chatId = parseInt(msg.chat.id, 10);

    // Проверяем, является ли пользователь администратором
    if (chatId !== ADMIN_CHAT_ID) {
        bot.sendMessage(chatId, "❌ Эта команда доступна только администратору.");
        return;
    }

    // Получаем список всех пользователей
    db.all("SELECT chat_id FROM subscriptions", async (err, rows) => {
        if (err) {
            return console.error(err.message);
        }
        if (rows.length === 0) {
            bot.sendMessage(chatId, "❌ Нет активных пользователей.");
            return;
        }

        let message = "👥 Список активных пользователей:\n";
        for (const row of rows) {
            try {
                const user = await bot.getChat(row.chat_id);
                const username = user.username ? `@${user.username}` : "Нет никнейма";
                message += `• chat_id: ${row.chat_id}, Никнейм: ${username}\n`;
            } catch (error) {
                console.error(`Ошибка при получении данных пользователя с chat_id ${row.chat_id}:`, error.message);
                message += `• chat_id: ${row.chat_id}, Данные недоступны\n`;
            }
        }

        bot.sendMessage(chatId, message);

        // Запрашиваем chat_id пользователя
        bot.sendMessage(chatId, "Введите chat_id пользователя:");
        bot.once('message', (msgChatId) => {
            const targetChatId = msgChatId.text;

            // Проверяем, является ли chat_id числом
            if (!/^\d+$/.test(targetChatId)) {
                bot.sendMessage(chatId, "❌ Некорректный chat_id. Введите число.");
                return;
            }

            // Запрашиваем текст сообщения
            bot.sendMessage(chatId, "Введите текст сообщения:");
            bot.once('message', (msgText) => {
                const messageText = msgText.text;

                // Отправляем сообщение пользователю
                bot.sendMessage(targetChatId, messageText)
                    .then(() => {
                        bot.sendMessage(chatId, `✅ Сообщение успешно отправлено пользователю с chat_id ${targetChatId}.`);
                    })
                    .catch((error) => {
                        console.error(`Ошибка при отправке сообщения пользователю с chat_id ${targetChatId}:`, error.message);
                        bot.sendMessage(chatId, `❌ Не удалось отправить сообщение пользователю с chat_id ${targetChatId}.`);
                    });
            });
        });
    });
});

// Обработчик inline-кнопок
bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const action = query.data;

    if (action === 'change_language') {
        const selectLanguagePrompt = await getLocaleText(chatId, 'select_language_prompt');
        const keyboard = {
            reply_markup: {
                inline_keyboard: [
                    [{ text: 'Русский', callback_data: 'set_language_ru' }],
                    [{ text: 'English', callback_data: 'set_language_en' }]
                ]
            }
        };
        bot.sendMessage(chatId, selectLanguagePrompt, keyboard);
    } else if (action === 'set_language_ru') {
        db.run("UPDATE subscriptions SET language = ? WHERE chat_id = ?", ['ru', chatId], (err) => {
            if (err) {
                console.error(err.message);
                bot.sendMessage(chatId, "❌ Произошла ошибка при изменении языка.");
                return;
            }
            bot.sendMessage(chatId, "✅ Язык успешно изменен на русский.");
            sendMenu(chatId, getMainMenuKeyboard);
        });
    } else if (action === 'set_language_en') {
        db.run("UPDATE subscriptions SET language = ? WHERE chat_id = ?", ['en', chatId], (err) => {
            if (err) {
                console.error(err.message);
                bot.sendMessage(chatId, "❌ An error occurred while changing the language.");
                return;
            }
            bot.sendMessage(chatId, "✅ Language successfully changed to English.");
            sendMenu(chatId, getMainMenuKeyboard);
        });
    }
      else if (action === 'subscription_menu') {
        await sendMenu(chatId, getSubscriptionMenuKeyboard);
    } else if (action === 'actions_menu') {
        await sendMenu(chatId, getActionsMenuKeyboard);
    } else if (action === 'back_to_main_menu') {
        await sendMenu(chatId, getMainMenuKeyboard);
    } else if (action === 'subscribe') {
        const promptMessage = await getLocaleText(chatId, 'enter_city_prompt');
        bot.sendMessage(chatId, promptMessage);
        userStates[chatId] = 'waiting_for_city_subscribe';
    } else if (action === 'change_city') {
        const promptMessage = await getLocaleText(chatId, 'enter_new_city_prompt');
        bot.sendMessage(chatId, promptMessage);
        userStates[chatId] = 'waiting_for_city';
    } else if (action === 'change_time') {
        const promptMessage = await getLocaleText(chatId, 'enter_new_time_prompt');
        bot.sendMessage(chatId, promptMessage);
        userStates[chatId] = 'waiting_for_time';
    } else if (action === 'unsubscribe') {
        const confirmationMessage = await getLocaleText(chatId, 'unsubscribe_confirmation');
        db.run("DELETE FROM subscriptions WHERE chat_id = ?", [chatId], function (err) {
            if (err) {
                return console.error(err.message);
            }
            if (this.changes > 0) {
                bot.sendMessage(chatId, confirmationMessage);
            } else {
                bot.sendMessage(chatId, "❌ У вас нет активной подписки.");
            }
            sendMenu(chatId, getMainMenuKeyboard);
        });
    }
    else if (action === 'current_weather') {
        const chatId = query.message.chat.id; // Убедитесь, что chatId извлекается из query
        db.get("SELECT city FROM subscriptions WHERE chat_id = ?", [chatId], async (err, row) => {
            if (err) {
                console.error(err.message);
                const errorMessage = await getLocaleText(chatId, 'weather_fetch_error');
                bot.sendMessage(chatId, errorMessage);
                sendMenu(chatId, getMainMenuKeyboard);
                return;
            }
    
            if (!row || !row.city) {
                const errorMessage = await getLocaleText(chatId, 'city_not_set_error');
                bot.sendMessage(chatId, errorMessage);
                sendMenu(chatId, getMainMenuKeyboard);
                return;
            }
    
            const city = row.city;
            const weatherData = await getWeatherByCity(city);
    
            if (!weatherData) {
                const errorMessage = await getLocaleText(chatId, 'weather_fetch_error');
                await bot.sendMessage(chatId, `${errorMessage} ${city}.`);
                sendMenu(chatId, getMainMenuKeyboard);
                return;
            }
    
            const message = await formatWeatherMessage({ ...weatherData, chatId }, city); // Передаем chatId
            console.log(`Отправляем сообщение для chatId ${chatId}:`, message);
            await bot.sendMessage(chatId, message, { parse_mode: "Markdown" });
            sendMenu(chatId, getMainMenuKeyboard);
        });
    }
else if (action === 'feedback') {
    // Устанавливаем состояние ожидания отзыва
    userStates[chatId] = 'waiting_for_feedback';
    const feedbackPrompt = await getLocaleText(chatId, 'feedback_prompt');
    bot.sendMessage(chatId, feedbackPrompt);
}
else if (action === 'stats') {
    // Логика для статистики
    db.get("SELECT * FROM subscriptions WHERE chat_id = ?", [chatId], async (err, subscriptionRow) => {
        if (err) {
            console.error(err.message);
            const errorMessage = await getLocaleText(chatId, 'stats_error');
            bot.sendMessage(chatId, errorMessage);
            sendMenu(chatId, getMainMenuKeyboard); // Возвращаем меню при ошибке
            return;
        }

        db.get("SELECT * FROM user_stats WHERE chat_id = ?", [chatId], async (err, statsRow) => {
            if (err) {
                console.error(err.message);
                const errorMessage = await getLocaleText(chatId, 'stats_error');
                bot.sendMessage(chatId, errorMessage);
                sendMenu(chatId, getMainMenuKeyboard); // Возвращаем меню при ошибке
                return;
            }

            db.all("SELECT * FROM weather_history WHERE chat_id = ? AND date >= date('now', '-30 days')", [chatId], async (err, weatherRows) => {
                if (err) {
                    console.error(err.message);
                    const errorMessage = await getLocaleText(chatId, 'stats_error');
                    bot.sendMessage(chatId, errorMessage);
                    sendMenu(chatId, getMainMenuKeyboard); // Возвращаем меню при ошибке
                    return;
                }

                // Подсчитываем статистику по погоде
                const temperatures = weatherRows.map(row => row.temperature);
                const avgTemperature = temperatures.reduce((sum, temp) => sum + temp, 0) / temperatures.length || 0;
                const maxTemperature = Math.max(...temperatures) || 0;
                const minTemperature = Math.min(...temperatures) || 0;
                const rainyDays = weatherRows.filter(row => row.description.toLowerCase().includes('rain')).length;
                const sunnyDays = weatherRows.filter(row => row.description.toLowerCase().includes('clear')).length;

                // Формируем сообщение со статистикой
                let message = "";
                if (subscriptionRow) {
                    const subscriptionStartDate = new Date(subscriptionRow.subscription_start); // Преобразуем строку в объект Date
                    const now = new Date();
                    const weeksActive = Math.floor((now - subscriptionStartDate) / (1000 * 60 * 60 * 24 * 7));
                    const subscriptionActiveText = await getLocaleText(chatId, 'subscription_active_since');
                    message += `${subscriptionActiveText} ${subscriptionStartDate.toLocaleDateString()} (${weeksActive} недели)\n`;
                }
                if (statsRow) {
                    const usageStatsText = await getLocaleText(chatId, 'usage_stats');
                    message += `\n${usageStatsText}\n` +
                        `• ${await getLocaleText(chatId, 'total_requests')}: ${statsRow.total_requests}\n` +
                        `• ${await getLocaleText(chatId, 'weather_requests')}: ${statsRow.weather_requests}\n` +
                        `• ${await getLocaleText(chatId, 'city_changes')}: ${statsRow.city_changes}\n` +
                        `• ${await getLocaleText(chatId, 'time_changes')}: ${statsRow.time_changes}\n`;
                }
                if (weatherRows.length > 0) {
                    const weatherStatsText = await getLocaleText(chatId, 'weather_stats');
                    message += `\n${weatherStatsText}\n` +
                        `• ${await getLocaleText(chatId, 'average_temperature')}: ${avgTemperature.toFixed(1)}°C\n` +
                        `• ${await getLocaleText(chatId, 'max_temperature')}: ${maxTemperature.toFixed(1)}°C\n` +
                        `• ${await getLocaleText(chatId, 'min_temperature')}: ${minTemperature.toFixed(1)}°C\n` +
                        `• ${await getLocaleText(chatId, 'rainy_days')}: ${rainyDays}\n` +
                        `• ${await getLocaleText(chatId, 'sunny_days')}: ${sunnyDays}\n`;
                } else {
                    const noWeatherDataText = await getLocaleText(chatId, 'no_weather_data');
                    message += `\n${noWeatherDataText}`;
                }

                // Отправляем сообщение со статистикой
                await bot.sendMessage(chatId, message);

                // Возвращаем главное меню
                sendMenu(chatId, getMainMenuKeyboard);
            });
        });
    });
}
});

// Обработчик текстовых сообщений
bot.on('message', async (msg) => {
    const chatId = parseInt(msg.chat.id, 10);
    const text = msg.text;

    // Увеличиваем общий счетчик запросов
    db.run("INSERT OR IGNORE INTO user_stats (chat_id) VALUES (?)", [chatId]);
    db.run("UPDATE user_stats SET total_requests = total_requests + 1 WHERE chat_id = ?", [chatId]);

    // Игнорируем команды (начинаются с "/")
    if (text.startsWith('/')) {
        return;
    }

    // Проверяем состояние пользователя
    if (userStates[chatId] === 'waiting_for_city_subscribe') {
        // Пользователь вводит город
        const city = text.trim(); // Удаляем лишние пробелы

        // Проверяем, что город введен
        if (!city || city.trim() === '') {
            const errorMessage = await getLocaleText(chatId, 'city_not_set_error');
            bot.sendMessage(chatId, errorMessage);
            return;
        }

        // Получаем погоду для города
        const weatherData = await getWeatherByCity(city);
        if (!weatherData) {
            const errorMessage = await getLocaleText(chatId, 'city_not_found_error');
            bot.sendMessage(chatId, `${errorMessage} "${city}". ${await getLocaleText(chatId, 'try_again_prompt')}`);
            delete userStates[chatId]; // Сбрасываем состояние
            return;
        }

        // Сохраняем город во временное состояние
        userStates[chatId] = { step: 'waiting_for_time_subscribe', city };

        // Запрашиваем время
        const timePrompt = await getLocaleText(chatId, 'enter_time_prompt');
        bot.sendMessage(chatId, `${timePrompt}\n${await getLocaleText(chatId, 'timezone_notice')}`);
    } else if (userStates[chatId]?.step === 'waiting_for_time_subscribe') {
        // Пользователь вводит время
        const time = text.trim(); // Удаляем лишние пробелы

        // Проверяем формат времени (HH:MM)
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (!timeRegex.test(time)) {
            const invalidTimeError = await getLocaleText(chatId, 'invalid_time_format_error');
            bot.sendMessage(chatId, `${invalidTimeError} HH:MM.`);
            return;
        }

        // Получаем сохраненный город из состояния
        const city = userStates[chatId].city;
        const escapeString = (str) => str.replace(/'/g, "''"); // Экранируем апострофы

        const cityEscaped = escapeString(city); // Экранируем city
        const timeEscaped = escapeString(time); // Экранируем time

        
        // Выполняем запрос
        db.run(
            "INSERT INTO subscriptions (chat_id, city, time) VALUES (?, ?, ?) ON CONFLICT(chat_id) DO UPDATE SET city = excluded.city, time = excluded.time",
            [chatId, cityEscaped, timeEscaped],
            async function (err) {
                if (err) {
                    console.error("Ошибка при сохранении данных:", err.message);
                    const errorMessage = await getLocaleText(chatId, 'subscription_error');
                    bot.sendMessage(chatId, errorMessage || "❌ Произошла ошибка при сохранении подписки.");
                    return;
                }
                const subscriptionSuccessMessage = await getLocaleText(chatId, 'subscription_success');
                bot.sendMessage(chatId, `${subscriptionSuccessMessage} ${city} в ${time}.`);
                delete userStates[chatId]; // Сбрасываем состояние
                sendMenu(chatId, getMainMenuKeyboard); // Передаем функцию клавиатуры
            }
        );

    } else if (userStates[chatId] === 'waiting_for_city') {
        // Обработка изменения города
        const city = text.trim(); // Удаляем лишние пробелы

        // Проверяем, что город введен
        if (!city || city.trim() === '') {
            const errorMessage = await getLocaleText(chatId, 'city_not_set_error');
            bot.sendMessage(chatId, errorMessage);
            return;
        }

        // Получаем погоду для города
        const weatherData = await getWeatherByCity(city);
        if (!weatherData) {
            const errorMessage = await getLocaleText(chatId, 'city_not_found_error');
            bot.sendMessage(chatId, `${errorMessage} "${city}". ${await getLocaleText(chatId, 'try_again_prompt')}`);
            delete userStates[chatId]; // Сбрасываем состояние
            return;
        }

        // Обновляем город в базе данных
        db.run("UPDATE subscriptions SET city = ? WHERE chat_id = ?", [city, chatId], async function (err) {
            if (err) {
                console.error(err.message);
                const errorMessage = await getLocaleText(chatId, 'city_change_error');
                bot.sendMessage(chatId, errorMessage);
                return;
            }
            const cityChangeSuccessMessage = await getLocaleText(chatId, 'city_change_success');
            bot.sendMessage(chatId, `${cityChangeSuccessMessage} ${city}.`);
            db.run("UPDATE user_stats SET city_changes = city_changes + 1 WHERE chat_id = ?", [chatId]);
            delete userStates[chatId]; // Сбрасываем состояние
            sendMenu(chatId, getMainMenuKeyboard); // Передаем функцию клавиатуры
        });
    } else if (userStates[chatId] === 'waiting_for_time') {
        // Пользователь вводит время
        const time = text.trim(); // Удаляем лишние пробелы

        // Проверяем формат времени (HH:MM)
        const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (!timeRegex.test(time)) {
            const invalidTimeError = await getLocaleText(chatId, 'invalid_time_format_error');
            bot.sendMessage(chatId, `${invalidTimeError} HH:MM.`);
            return;
        }

        // Обновляем время в базе данных
        db.run("UPDATE subscriptions SET time = ? WHERE chat_id = ?", [time, chatId], async function (err) {
            if (err) {
                console.error(err.message);
                const errorMessage = await getLocaleText(chatId, 'time_change_error');
                bot.sendMessage(chatId, errorMessage);
                return;
            }
            const timeChangeSuccessMessage = await getLocaleText(chatId, 'time_change_success');
            bot.sendMessage(chatId, `${timeChangeSuccessMessage} ${time}.`);
            delete userStates[chatId]; // Сбрасываем состояние
            sendMenu(chatId, getMainMenuKeyboard); // Передаем функцию клавиатуры
        });
    } else if (userStates[chatId] === 'waiting_for_feedback') {
        // Обработка отзыва
        const feedback = text.trim(); // Удаляем лишние пробелы
    
        if (!feedback) {
            const invalidFeedbackError = await getLocaleText(chatId, 'invalid_feedback_error');
            bot.sendMessage(chatId, invalidFeedbackError);
            delete userStates[chatId]; // Сбрасываем состояние
            sendMenu(chatId, getMainMenuKeyboard); // Возвращаем меню
            return;
        }
    
        // Отправляем отзыв администратору
        bot.sendMessage(ADMIN_CHAT_ID, `🔔 Новый отзыв от пользователя ${chatId}:\n${feedback}`);
    
        // Уведомляем пользователя об успешной отправке отзыва
        const feedbackSuccessMessage = await getLocaleText(chatId, 'feedback_success');
        bot.sendMessage(chatId, feedbackSuccessMessage);
    
        // Сбрасываем состояние и возвращаем меню
        delete userStates[chatId];
        sendMenu(chatId, getMainMenuKeyboard);
    }
});

bot.onText(/\/language/, async (msg) => {
    const chatId = parseInt(msg.chat.id, 10);

    const message = await getLocaleText(chatId, 'select_language_prompt');
    const keyboard = {
        reply_markup: {
            inline_keyboard: [
                [{ text: 'Русский', callback_data: 'set_language_ru' }],
                [{ text: 'English', callback_data: 'set_language_en' }]
            ]
        }
    };

    bot.sendMessage(chatId, message, keyboard);
});


// Обработчик команды /adminstats (только для администратора)
bot.onText(/\/adminstats/, async (msg) => {
    const chatId = parseInt(msg.chat.id, 10);

    // Проверяем, является ли пользователь администратором
    if (chatId !== ADMIN_CHAT_ID) {
        const adminOnlyMessage = await getLocaleText(chatId, 'admin_only_command');
        bot.sendMessage(chatId, adminOnlyMessage);
        return;
    }

    // Получаем общую статистику
    db.all("SELECT city, COUNT(*) AS count FROM subscriptions GROUP BY city ORDER BY count DESC", async (err, rows) => {
        if (err) {
            return console.error(err.message);
        }

        let message = `${await getLocaleText(chatId, 'bot_usage_stats')}:\n`;

        // Активные подписчики
        db.get("SELECT COUNT(*) AS active_users FROM subscriptions", async (err, activeUsersRow) => {
            if (err) {
                return console.error(err.message);
            }
            const activeUsersText = await getLocaleText(chatId, 'active_subscribers');
            message += `${activeUsersText}: ${activeUsersRow.active_users}\n`;

            // Новые пользователи за неделю
            db.get("SELECT COUNT(*) AS new_users FROM subscriptions WHERE subscription_start >= date('now', '-7 days')", async (err, newUsersRow) => {
                if (err) {
                    return console.error(err.message);
                }
                const newUsersText = await getLocaleText(chatId, 'new_users_last_week');
                message += `${newUsersText}: ${newUsersRow.new_users}\n`;

                // Популярные города
                const popularCitiesText = await getLocaleText(chatId, 'popular_cities');
                message += `\n${popularCitiesText}:\n`;
                if (rows.length > 0) {
                    for (const row of rows) {
                        const usersText = await getLocaleText(chatId, 'users');
                        message += `• ${row.city}: ${row.count} ${usersText}\n`;
                    }
                } else {
                    const noDataText = await getLocaleText(chatId, 'no_data_available');
                    message += `${noDataText}\n`;
                }

                // Общее количество запросов
                db.get("SELECT SUM(total_requests) AS total_requests FROM user_stats", async (err, requestsRow) => {
                    if (err) {
                        return console.error(err.message);
                    }
                    const totalRequestsText = await getLocaleText(chatId, 'total_requests_all_time');
                    message += `\n${totalRequestsText}: ${requestsRow.total_requests}`;

                    // Отправляем сообщение администратору
                    bot.sendMessage(chatId, message);
                });
            });
        });
    });
});

console.log("Бот запущен!");