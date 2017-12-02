const fs = require('fs');
const http = require('http');
const notifier = require('node-notifier');
const settings = JSON.parse(fs.readFileSync("settings.json", "UTF-8"));
let history = null;

startApplication();

function startApplication() {
    retrieveHistory();
    receiveLatestData();

    setInterval(() => {
        receiveLatestData();
    }, settings.request_rate_in_seconds * 1000);
}

function retrieveHistory() {
    if (fs.existsSync(settings.history_location)) {
        history = JSON.parse(fs.readFileSync(settings.history_location, "UTF-8"));
    }
}

function receiveLatestData() {
    const options = {
        host: settings.connection.host,
        path: settings.connection.path,
        port: 80,
        method: "GET",
        //This is the only line that is new. `headers` is an object with the headers to request
        headers: {
            "Cookie": `session=${settings.connection.session_cookie}`
        }
    };

    http.request(options, (response) => {
        let responseString = "";
        response.on('data', function (chunk) {
            responseString += chunk;
        });

        response.on('end', function () {
            handleReceivedData(JSON.parse(responseString));
        });
    }).on("error", (err) => {
        console.log("Error: " + err.message);
    }).end();
}

function handleReceivedData(mostRecentData) {
    // First time date is retrieved
    if (history == null)
        writeToHistory(mostRecentData);
    else {
        const changes = detectChanges(mostRecentData);
        if (changes.length > 0) {
            notifyUser(changes, mostRecentData);
            writeToHistory(mostRecentData);
        }
    }
}

function detectChanges(mostRecentData) {
    const changes = [];

    Object.keys(mostRecentData.members).forEach((memberId) => {
        const memberOfResults = mostRecentData.members[memberId];

        // Make sure comparing doesn't brake on non-existing values
        if (!history.members.hasOwnProperty(memberId))
            history.members[memberId] = {"completion_day_level": {}};

        Object.keys(memberOfResults.completion_day_level).forEach((dayNumber) => {
            const dayCompletion = memberOfResults.completion_day_level[dayNumber];

            let historyCompletionDay = history.members[memberId].completion_day_level;
            const dayExistsInHistory = historyCompletionDay.hasOwnProperty(dayNumber);

            Object.keys(dayCompletion).forEach((dayPart) => {
                if (!dayExistsInHistory || !historyCompletionDay[dayNumber].hasOwnProperty(dayPart))
                    changes.push(`${memberOfResults.name} finished day ${dayNumber} part ${dayPart}`);
            })
        });
    });

    return changes;
}

function notifyUser(changes, mostRecentData) {
    const highestUser = calculateScoreLeaderNameWithAmount(mostRecentData);

    notifier.notify({
        'title': `Topscore: ${highestUser.name} - ${highestUser.local_score}`,
        'message': changes.join("\r\n")
    });
}

function calculateScoreLeaderNameWithAmount(mostRecentData) {
    const values = Object.keys(mostRecentData.members).map(key => mostRecentData.members[key]);
    return values.reduce((previousValue, currentValue) => {
        if (currentValue.local_score > previousValue.local_score)
            return currentValue;
        else
            return previousValue;
    });
}

function writeToHistory(mostRecentData) {
    fs.writeFileSync(settings.history_location, JSON.stringify(mostRecentData));
    history = mostRecentData;
}