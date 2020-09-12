require("dotenv").config()
const Discord = require("discord.js")
const client = new Discord.Client();

const replaceString = require('replace-string');
const https = require('https');
const redis = require("redis");
let redisClient = null;

var fs = require('fs');

var gasPrice = 40;
var ethPrice = 360;

var coingeckoUsd;
var coingeckoEth;
var coingeckoBtc;
var binanceUsd;
var kucoinUsd;

var quotient = 0.0192;

var start = new Date('2020-08-21 05:00');

var bondedSwth = '50%';
var totalSupply = '1,005,188,672 SWTH';
var tradeHubSupply = '535,067,822 SWTH';
var stakingAPR = '187.83%';
var marketCap = '$55,130,578';
var activeValidators = 11;

var avgFee = '5';

var validators = [];

let gasSubscribersMap = new Map();
let gasSubscribersLastPushMap = new Map();

console.log("Redis URL:" + process.env.REDIS_URL);

if (process.env.REDIS_URL) {
    redisClient = redis.createClient(process.env.REDIS_URL);
    redisClient.on("error", function (error) {
        console.error(error);
    });

    redisClient.get("gasSubscribersMap", function (err, obj) {
        gasSubscribersMapRaw = obj;
        console.log("gasSubscribersMapRaw:" + gasSubscribersMapRaw);
        if (gasSubscribersMapRaw) {
            gasSubscribersMap = new Map(JSON.parse(gasSubscribersMapRaw));
            console.log("gasSubscribersMap:" + gasSubscribersMap);
        }
    });

    redisClient.get("gasSubscribersLastPushMap", function (err, obj) {
        gasSubscribersLastPushMapRaw = obj;
        console.log("gasSubscribersLastPushMapRaw:" + gasSubscribersLastPushMapRaw);
        if (gasSubscribersLastPushMapRaw) {
            gasSubscribersLastPushMap = new Map(JSON.parse(gasSubscribersLastPushMapRaw));
            console.log("gasSubscribersLastPushMap:" + gasSubscribersLastPushMap);
        }
    });


}

client.on("ready", () => {
    console.log(`Logged in as ${client.user.tag}!`)
})
// client.on("guildMemberAdd", function (member) {
//     member.send("Hi and welcome to Switcheo! I am Switcheo FAQ bot. I will be very happy to assist you, just ask me for **help**.");
// });

client.on("message", msg => {

        if (!msg.author.username.toUpperCase().includes("AMA")) {
            if (!(msg.channel.type == "dm")) {
                // this is logic for channels
                if (msg.content.toLowerCase().trim() == "!faq") {
                    msg.reply("Hi, I am Switcheo FAQ bot. I will be very happy to assist you, just ask me for **help** in DM.");
                } else if (msg.content.toLowerCase().trim() == "!faq help") {
                    msg.reply("I can only answer a predefined question by its number or by alias in a channel, e.g. **question 1**, or **gas price**. \n For more commands and options send me **help** in DM");
                } else if (msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').startsWith("!faq question")) {
                    doQuestion(msg, "!faq question", false);
                } else if (msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').startsWith("!faq calculate rewards")) {
                    let content = msg.content.toLowerCase().trim().replace(/ +(?= )/g, '');
                    const args = content.slice("faq calculate rewards".length).split(' ');
                    args.shift();
                    const command = args.shift().trim();
                    if (command && !isNaN(command)) {
                        var fee = false;
                        if (content.includes("with")) {
                            var argsSecondPart = content.slice(content.indexOf("with") + "with".length).split(' ');
                            argsSecondPart.shift();
                            fee = argsSecondPart.shift().trim();
                        }
                        doCalculate(command, msg, gas, false);
                    }
                } else if (msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').startsWith("!faq show chart")) {
                    let content = msg.content.toLowerCase().trim().replace(/ +(?= )/g, '');
                    const args = content.slice("!faq show chart".length).split(' ');
                    args.shift();
                    const command = args.shift().trim();
                    doShowChart(command, msg, false);
                } else if (msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').startsWith("!faq show exchange chart")) {
                    let content = msg.content.toLowerCase().trim().replace(/ +(?= )/g, '');
                    const args = content.slice("!faq exchange show chart".length).split(' ');
                    args.shift();
                    const command = args.shift().trim();
                    doShowChart(command, msg, false);
                } else if (msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').startsWith("!faq ")) {
                    let found = checkAliasMatching(false);
                    if (!found) {
                        msg.reply("Oops, I don't know that one. You can get all aliases if you send me a DM **aliases** \n You can check out https://github.com/dgornjakovic/swth-faq for list of known questions and aliases");
                    }
                }
            } else {
                try {

                    // this is the logic for DM
                    console.log("I got sent a DM:" + msg.content);

                    let found = checkAliasMatching(true);
                    // if alias is found, just reply to it, otherwise continue

                    if (!found) {
                        let encodedForm = Buffer.from(msg.content.toLowerCase()).toString('base64');
                        if (checkIfUltimateQuestion(encodedForm)) {
                            answerUltimateQuestion();
                        } else if (msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').startsWith("unsubscribe")) {
                            gasSubscribersMap.delete(msg.author.id);
                            gasSubscribersLastPushMap.delete(msg.author.id);
                            if (process.env.REDIS_URL) {
                                redisClient.set("gasSubscribersMap", JSON.stringify([...gasSubscribersMap]), function () {
                                });
                                redisClient.set("gasSubscribersLastPushMap", JSON.stringify([...gasSubscribersLastPushMap]), function () {
                                });
                            }
                            msg.reply("You are now unsubscribed from gas updates");
                        } else if (msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').startsWith("subscribe gas")) {
                            const args = msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').slice("subscribe gas".length).split(' ');
                            args.shift();
                            const command = args.shift().trim();
                            if (command && !isNaN(command)) {
                                gasSubscribersMap.set(msg.author.id, command);
                                gasSubscribersLastPushMap.delete(msg.author.id);
                                msg.reply(" I will send you a message once safe gas price is below " + command + " gwei , and every hour after that that it remains below that level. \nTo change the threshold level for gas price, send me a new subscribe message with the new amount.\n" +
                                    "To unsubscribe, send me another DM **unsubscribe**.");
                            } else {
                                msg.reply(command + " is not a proper integer number.");
                            }
                        } else if (msg.content.toLowerCase().trim() == "aliases") {
                            showAllAliases(true);
                        } else if (msg.content.toLowerCase().trim() == "help") {
                            doFaqHelp();
                        } else if (msg.content.startsWith("help ")) {
                            const args = msg.content.slice("help".length).split(' ');
                            args.shift();
                            const command = args.shift().trim();
                            if (command == "question") {
                                msg.reply("Choose your question with ***question questionNumber***, e.g. ***question 1***\nYou can get the question number via **list** command");
                            } else if (command == "category") {
                                msg.reply("Choose your category with ***category categoryName***, e.g. ***category SWTH***\nCategory name is fetched from **categories** command");
                            } else if (command == "search") {
                                msg.reply("Search for questions with ***search searchTerm***, e.g. ***search validators***");
                            } else {
                                msg.reply("I don't know that one. Try just **help** for known commands");
                            }
                        } else if (msg.content.toLowerCase().trim() == "list" || msg.content.toLowerCase().trim() == "questions") {
                            listQuestions();
                        } else if (msg.content.toLowerCase().startsWith("question ")) {
                            console.log("question asked:" + msg.content);
                            doQuestion(msg, "question", true);
                        } else if (msg.content == "categories") {
                            listCategories();
                        } else if (msg.content.toLowerCase().startsWith("category")) {

                            const args = msg.content.slice("category".length).split(' ');
                            args.shift();
                            const command = args.shift();

                            let rawdata = fs.readFileSync('categories/categories.json');
                            let categories = JSON.parse(rawdata);

                            const exampleEmbed = new Discord.MessageEmbed()
                                .setColor('#0099ff')
                                .setTitle('Questions in category ' + command + ':');

                            let found = false;
                            categories.forEach(function (category) {
                                if (category.name == command) {
                                    found = true;
                                    category.questions.forEach(function (question) {
                                        rawdata = fs.readFileSync('questions/' + question + ".txt", "utf8");
                                        exampleEmbed.addField(question, rawdata, false);
                                    });
                                }
                            });

                            if (!found) {
                                exampleEmbed.addField('\u200b', "That doesn't look like a known category. Use a category name from **categories** command, e.g. **category SWTH**");
                            } else {
                                exampleEmbed.addField('\u200b', 'Choose your question with e.g. **question 1**');
                            }
                            msg.reply(exampleEmbed);

                        } else if (msg.content.toLowerCase().startsWith("search ")) {

                            const args = msg.content.slice("search".length).split(' ').slice(1);
                            const searchWord = msg.content.substring("search".length + 1);
                            doSearch(searchWord, args);

                        } else if (msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').startsWith("calculate rewards")) {
                            let content = msg.content.toLowerCase().trim().replace(/ +(?= )/g, '');
                            const args = content.slice("calculate rewards".length).split(' ');
                            args.shift();
                            const command = args.shift().trim();
                            if (command && !isNaN(command)) {
                                var fee = false;
                                if (content.includes("with")) {
                                    var argsSecondPart = content.slice(content.indexOf("with") + "with".length).split(' ');
                                    argsSecondPart.shift();
                                    fee = argsSecondPart.shift().trim();
                                }
                                doCalculate(command, msg, fee, true);
                            }
                        } else if (msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').startsWith("show chart")) {
                            let content = msg.content.toLowerCase().trim().replace(/ +(?= )/g, '');
                            const args = content.slice("show chart".length).split(' ');
                            args.shift();
                            const command = args.shift().trim();
                            doShowChart(command, msg, true);
                        } else if (msg.content.toLowerCase().trim().replace(/ +(?= )/g, '').startsWith("show exchange chart")) {
                            let content = msg.content.toLowerCase().trim().replace(/ +(?= )/g, '');
                            const args = content.slice("show exchange chart".length).split(' ');
                            args.shift();
                            const command = args.shift().trim();
                            doShowChart(command, msg, true);
                        } else {
                            if (!msg.author.username.toLowerCase().includes("faq")) {
                                if (msg.content.endsWith("?")) {
                                    const args = msg.content.substring(0, msg.content.length - 1).split(' ');
                                    const searchWord = msg.content;
                                    doCustomQuestion(searchWord, args);
                                } else {
                                    msg.reply("Oops, I don't know that one. Try **help** to see what I do know, or if you want to ask a custom question, make sure it ends with a question mark **?**");
                                }
                            }
                        }
                    }
                } catch (e) {
                    msg.reply("Unknown error ocurred.  Try **help** to see what I do know, or if you want to ask a custom question, make sure it ends with a question mark **?**");
                }
            }
        }

        function showAllAliases(isDM) {
            let rawdata = fs.readFileSync('categories/aliases.json');
            let aliases = JSON.parse(rawdata);
            let questionMap = new Map();
            aliases.forEach(function (alias) {
                let aliasQuestion = questionMap.get(alias.number);
                if (aliasQuestion) {
                    aliasQuestion.push(alias.alias);
                    questionMap.set(alias.number, aliasQuestion);
                } else {
                    let aliasQuestion = new Array();
                    aliasQuestion.push(alias.alias);
                    questionMap.set(alias.number, aliasQuestion);
                }
            });

            let exampleEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Known aliases')
                .setURL('https://github.com/dgornjakovic/swth-faq');
            exampleEmbed.setDescription('Hello, here are the aliases I know:');

            let counter = 0;
            let pagenumber = 2;
            for (let [questionNumber, questions] of questionMap) {
                let questionsString = "";
                questions.forEach(function (q) {
                    questionsString += (isDM ? "" : "!faq ") + q + "\n";
                })
                let rawdata = fs.readFileSync('answers/' + questionNumber + '.json');
                let answer = JSON.parse(rawdata);
                exampleEmbed.addField(answer.title + ' ' + answer.description, questionsString);

                counter++;
                if (counter == 10) {
                    if (isDM) {
                        msg.reply(exampleEmbed);
                    } else {
                        msg.channel.send(exampleEmbed);
                    }
                    exampleEmbed = new Discord.MessageEmbed()
                        .setColor('#0099ff')
                        .setTitle('Known aliases page ' + pagenumber)
                        .setURL('https://github.com/dgornjakovic/swth-faq');
                    exampleEmbed.setDescription('Hello, here are the aliases I know:');
                    pagenumber++;
                    counter = 0;
                }

            }

            if (isDM) {
                msg.reply(exampleEmbed);
            } else {
                msg.channel.send(exampleEmbed);
            }
        }

        function answerUltimateQuestion() {
            const exampleEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Bravo, you found the ultimate question!');

            exampleEmbed.setDescription(Buffer.from("d2hhdCBpcyB0aGUgYW5zd2VyIHRvIGxpZmUgdGhlIHVuaXZlcnNlIGFuZCBldmVyeXRoaW5nPw==", 'base64').toString('utf-8'));
            exampleEmbed.addField("The answer is:", Buffer.from("NDI=", 'base64').toString('utf-8'));

            msg.reply(exampleEmbed);
        }

        function checkIfUltimateQuestion(encodedForm) {
            return encodedForm == "d2hhdCBpcyB0aGUgYW5zd2VyIHRvIGxpZmUgdGhlIHVuaXZlcnNlIGFuZCBldmVyeXRoaW5nPw==" ||
                encodedForm == "d2hhdCdzIHRoZSBhbnN3ZXIgdG8gbGlmZSB0aGUgdW5pdmVyc2UgYW5kIGV2ZXJ5dGhpbmc/" ||
                encodedForm == "dGhlIGFuc3dlciB0byBsaWZlIHRoZSB1bml2ZXJzZSBhbmQgZXZlcnl0aGluZw==" ||
                encodedForm == "d2hhdCBpcyB0aGUgYW5zd2VyIHRvIGxpZmUgdGhlIHVuaXZlcnNlIGFuZCBldmVyeXRoaW5nPw==";
        }

        function checkAliasMatching(doReply) {
            let potentialAlias = msg.content.toLowerCase().replace("!faq", "").trim();
            let rawdata = fs.readFileSync('categories/aliases.json');
            let aliases = JSON.parse(rawdata);
            let found = false;
            aliases.forEach(function (alias) {
                if (alias.alias.toLowerCase().trim() == potentialAlias) {
                    found = true;
                    msg.content = "!faq question " + alias.number;
                    doQuestion(msg, "!faq question", doReply);
                }
            });
            return found;
        }

        function doFaqHelp() {
            const exampleEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Switcheo Frequently Asked Questions')
                .setURL('https://support.switcheo.network/en/');

            exampleEmbed.setDescription('Hello, here is list of commands I know:');
            exampleEmbed.addField("list", "Lists all known questions");
            exampleEmbed.addField("categories", "Lists all categories of known questions");
            exampleEmbed.addField("category categoryName", "Lists all known questions for a given category name, e.g. ** category *SWTH* **");
            exampleEmbed.addField("question questionNumber", "Shows the answer to the question defined by its number, e.g. ** question *7* **");
            exampleEmbed.addField("search searchTerm", "Search all known questions by given search term, e.g. ** search *SWTH price* **");
            exampleEmbed.addField("aliases", "List all known aliases");
            exampleEmbed.addField("subscribe gas gasPrice",
                "I will inform you the next time safe gas price is below your target gasPrice, e.g. **subscribe gas 30** will inform you if safe gas price is below 30 gwei");
            exampleEmbed.addField("calculate rewards swthStaked",
                "Calculate SWTH rewards per staked SWTH amount. E.g. *calculate rewards 1000*.");
            exampleEmbed.addField("show chart [period]",
                "Shows the SWTH price chart for the given period, e.g. **show chart 24H**");
            exampleEmbed.addField("show exchange chart [period]",
                "Shows the SWTH price chart for the given period, e.g. **show chart 24h**");
            exampleEmbed.addField("\u200b", "*Or just ask me a question and I will do my best to find a match for you, e.g. **What is the current gas price?***");

            msg.reply(exampleEmbed);
        }

        function listQuestions() {
            let exampleEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Frequently Asked Questions')
                .setURL('https://support.switcheo.network/en/');

            fs.readdir('questions', function (err, files) {
                if (err) {
                    console.log("Error getting directory information.")
                } else {
                    let counter = 0;
                    let pagenumber = 2;
                    files.sort(function (a, b) {
                        return a.substring(0, a.lastIndexOf(".")) * 1.0 - b.substring(0, b.lastIndexOf(".")) * 1.0;
                    });
                    files.forEach(function (file) {
                        let rawdata = fs.readFileSync('questions/' + file, "utf8");
                        exampleEmbed.addField(file.substring(0, file.lastIndexOf(".")), rawdata, false)
                        counter++;
                        if (counter == 20) {
                            msg.reply(exampleEmbed);
                            exampleEmbed = new Discord.MessageEmbed()
                                .setColor('#0099ff')
                                .setTitle('Frequently Asked Questions page ' + pagenumber)
                                .setURL('https://support.switcheo.network/en/');
                            pagenumber++;
                            counter = 0;
                        }
                    })
                }
                exampleEmbed.addField('\u200b', 'Choose your question with e.g. **question 1**');
                msg.reply(exampleEmbed);
            })
        }

        function listCategories() {
            let rawdata = fs.readFileSync('categories/categories.json');
            let categories = JSON.parse(rawdata);

            const exampleEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Categories');

            categories.forEach(function (category) {
                exampleEmbed.addField(category.name, category.desc, false);
            });

            exampleEmbed.addField('\u200b', "Choose the category with **category categoryName**, e.g. **category SWTH**");
            msg.reply(exampleEmbed);
        }

        function doSearch(searchWord, args) {
            const exampleEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Questions found for ***' + searchWord + '***:');

            const Match = class {
                constructor(title, value) {
                    this.title = title;
                    this.value = value;
                }

                matchedCount = 0;
                title;
                value;
            };

            const fullMatches = [];
            const partialMatches = [];
            fs.readdir('questions', function (err, files) {
                if (err) {
                    console.log("Error getting directory information.")
                } else {
                    files.sort(function (a, b) {
                        return a.substring(0, a.lastIndexOf(".")) * 1.0 - b.substring(0, b.lastIndexOf(".")) * 1.0;
                    });
                    files.forEach(function (file) {
                        let rawdata = fs.readFileSync('questions/' + file, "utf8");
                        if (rawdata.includes(searchWord)) {
                            rawdata = replaceString(rawdata, searchWord, '**' + searchWord + '**');
                            fullMatches.push(new Match(file.substring(0, file.lastIndexOf(".")), rawdata));
                        } else {
                            let matchedCount = 0;
                            args.sort(function (a, b) {
                                return a.length - b.length;
                            });
                            args.forEach(function (arg) {
                                if (rawdata.toLowerCase().includes(arg.toLowerCase())) {
                                    rawdata = replaceString(rawdata, arg, '**' + arg + '**');
                                    rawdata = replaceString(rawdata, arg.toLowerCase(), '**' + arg.toLowerCase() + '**');
                                    rawdata = replaceString(rawdata, arg.toUpperCase(), '**' + arg.toUpperCase() + '**');
                                    matchedCount++;
                                }
                            });
                            if (matchedCount > 0) {
                                let match = new Match(file.substring(0, file.lastIndexOf(".")), rawdata);
                                match.matchedCount = matchedCount;
                                partialMatches.push(match);
                            }
                        }
                    })
                }

                if (fullMatches.length == 0 && partialMatches.length == 0) {
                    exampleEmbed.setTitle('No questions found for ***' + searchWord + '***. Please refine your search.');
                } else {

                    let counter = 0;
                    fullMatches.forEach(function (match) {
                        counter++;
                        if (counter < 6) {
                            exampleEmbed.addField(match.title, match.value, false);
                        }
                    });

                    partialMatches.sort(function (a, b) {
                        return b.matchedCount - a.matchedCount;
                    });
                    partialMatches.forEach(function (match) {
                        counter++;
                        if (counter < 6) {
                            exampleEmbed.addField(match.title, match.value, false);
                        }
                    });

                    exampleEmbed.addField('\u200b', 'Choose your question with e.g. **question 1**');
                }
                msg.reply(exampleEmbed);
            })
        }

        function doCustomQuestion(searchWord, args) {
            const exampleEmbed = new Discord.MessageEmbed()
                .setColor('#0099ff')
                .setTitle('Looks like you asked a custom question. This is the best I could find for your query:');

            const Match = class {
                constructor(title, value) {
                    this.title = title;
                    this.value = value;
                }

                matchedCount = 0;
                title;
                value;
            };

            const fullMatches = [];
            const partialMatches = [];
            fs.readdir('questions', function (err, files) {
                if (err) {
                    console.log("Error getting directory information.")
                } else {
                    files.sort(function (a, b) {
                        return a.substring(0, a.lastIndexOf(".")) * 1.0 - b.substring(0, b.lastIndexOf(".")) * 1.0;
                    });
                    files.forEach(function (file) {
                        let rawdata = fs.readFileSync('questions/' + file, "utf8");
                        if (rawdata.includes(searchWord)) {
                            rawdata = replaceString(rawdata, searchWord, '**' + searchWord + '**');
                            fullMatches.push(new Match(file.substring(0, file.lastIndexOf(".")), rawdata));
                        } else {
                            args.sort(function (a, b) {
                                return a.length - b.length;
                            });
                            let matchedCount = 0;
                            args.forEach(function (arg) {
                                if (rawdata.toLowerCase().includes(arg.toLowerCase())) {
                                    rawdata = replaceString(rawdata, arg, '**' + arg + '**');
                                    rawdata = replaceString(rawdata, arg.toLowerCase(), '**' + arg.toLowerCase() + '**');
                                    rawdata = replaceString(rawdata, arg.toUpperCase(), '**' + arg.toUpperCase() + '**');
                                    matchedCount++;
                                }
                            });
                            if (matchedCount > 0) {
                                let match = new Match(file.substring(0, file.lastIndexOf(".")), rawdata);
                                match.matchedCount = matchedCount;
                                partialMatches.push(match);
                            }
                        }
                    })
                }

                if (fullMatches.length == 0 && partialMatches.length == 0) {
                    exampleEmbed.setTitle('No questions found for ***' + searchWord + '***. Please refine your search.');
                } else {

                    let counter = 0;
                    fullMatches.forEach(function (match) {
                        counter++;
                        if (counter < 4) {
                            exampleEmbed.addField(match.title, match.value, false);
                        }
                    });

                    partialMatches.sort(function (a, b) {
                        return b.matchedCount - a.matchedCount;
                    });
                    partialMatches.forEach(function (match) {
                        counter++;
                        if (counter < 4) {
                            exampleEmbed.addField(match.title, match.value, false);
                        }
                    });

                    exampleEmbed.addField('\u200b', 'Choose your question with e.g. **question 1**');
                }
                msg.reply(exampleEmbed);
            })
        }


        function doQuestion(msg, toSlice, doReply) {
            const args = msg.content.slice(toSlice.length).split(' ');
            args.shift();
            const command = args.shift();

            try {
                let rawdata = fs.readFileSync('answers/' + command + '.json');
                let answer = JSON.parse(rawdata);

                const exampleEmbed = new Discord.MessageEmbed();
                exampleEmbed.setColor(answer.color);
                exampleEmbed.setTitle(answer.title);
                exampleEmbed.setDescription(answer.description);
                exampleEmbed.setURL(answer.url);

                if (command == "7") {

                    https.get('https://gasprice.poa.network/', (resp) => {
                        let data = '';

                        // A chunk of data has been recieved.
                        resp.on('data', (chunk) => {
                            data += chunk;
                        });

                        // The whole response has been received. Print out the result.
                        resp.on('end', () => {
                            let result = JSON.parse(data);
                            exampleEmbed.addField("Safe low gas price:", result.slow + ' gwei', false);
                            exampleEmbed.addField("Standard gas price:", result.standard + ' gwei', false);
                            exampleEmbed.addField("Fast gas price:", result.fast + ' gwei', false);
                            exampleEmbed.addField("Instant gas price:", result.instant + ' gwei', false);
                            if (doReply) {
                                msg.reply(exampleEmbed);
                            } else {
                                msg.channel.send(exampleEmbed);
                            }
                        });

                    }).on("error", (err) => {
                        console.log("Error: " + err.message);
                    });

                } else if (command == "2") {

                    validators.sort(function (a, b) {
                        return b.tokens - a.tokens;
                    });
                    var community = [];
                    var companies = [];
                    validators.forEach(v => {
                        if (v.description.moniker.toLowerCase().includes("neo economy") ||
                            v.description.moniker.toLowerCase().includes("got") ||
                            v.description.moniker.toLowerCase().includes("intsol")) {
                            community.push(v);
                        } else {
                            companies.push(v);
                        }
                    });

                    exampleEmbed.addField("​\u200b", "​\u200b");
                    exampleEmbed.addField("Community validators:", "​\u200b");

                    community.forEach(v => {
                        let fee = v.commission.commission_rates.rate * 100;
                        fee = Math.round(((fee) + Number.EPSILON) * 100) / 100;
                        let site = "https://switcheo.org/validator/" + v.operator_address;
                        let tokens = v.tokens / 100000000;
                        tokens = Math.round(tokens);
                        tokens = getNumberLabel(Math.round(tokens));
                        var response = "[Profile](" + site + ") \nFee: **" + fee + "**%" + " \nPool size: **" + tokens + " swth**";
                        exampleEmbed.addField(v.description.moniker, response);
                    });

                    exampleEmbed.addField("​\u200b", "​\u200b");
                    exampleEmbed.addField("Companies:", "​\u200b");

                    companies.forEach(v => {
                        let fee = v.commission.commission_rates.rate * 100;
                        fee = Math.round(((fee) + Number.EPSILON) * 100) / 100;
                        let site = "https://switcheo.org/validator/" + v.operator_address;
                        let tokens = v.tokens / 100000000;
                        tokens = Math.round(tokens);
                        tokens = getNumberLabel(Math.round(tokens));
                        var response = "[Profile](" + site + ") \nFee: **" + fee + "**%" + " \nPool size: **" + tokens + " swth**";
                        exampleEmbed.addField(v.description.moniker, response);
                    });
                    if (doReply) {
                        msg.reply(exampleEmbed);
                    } else {
                        msg.channel.send(exampleEmbed);
                    }

                } else if (command == "9") {

                    exampleEmbed.addField("USD (coingecko)", coingeckoUsd, false);
                    exampleEmbed.addField("ETH (coingecko):", coingeckoEth, false);
                    exampleEmbed.addField("BTC (coingecko):", coingeckoBtc, false);
                    if (doReply) {
                        msg.reply(exampleEmbed);
                    } else {
                        msg.channel.send(exampleEmbed);
                    }

                } else if (command == "8") {

                    https.get('https://api.coingecko.com/api/v3/coins/ethereum', (resp) => {
                        let data = '';

                        // A chunk of data has been recieved.
                        resp.on('data', (chunk) => {
                            data += chunk;
                        });

                        // The whole response has been received. Print out the result.
                        resp.on('end', () => {
                            let result = JSON.parse(data);
                            exampleEmbed.addField("USD", result.market_data.current_price.usd, false);
                            exampleEmbed.addField("BTC:", result.market_data.current_price.btc, false);
                            if (doReply) {
                                msg.reply(exampleEmbed);
                            } else {
                                msg.channel.send(exampleEmbed);
                            }
                        });

                    }).on("error", (err) => {
                        console.log("Error: " + err.message);
                    });

                } else {

                    answer.fields.forEach(function (field) {
                        exampleEmbed.addField(field.title, field.value, field.inline);
                    });

                    if (answer.footer.title) {
                        exampleEmbed.setFooter(answer.footer.title, answer.footer.value);

                    }

                    if (answer.image) {
                        exampleEmbed.attachFiles(['images/' + answer.image])
                            .setImage('attachment://' + answer.image);
                    }

                    if (answer.thumbnail) {
                        exampleEmbed.attachFiles(['images/' + answer.thumbnail])
                            .setThumbnail('attachment://' + answer.thumbnail);
                    }

                    if (doReply) {
                        msg.reply(exampleEmbed);
                    } else {
                        msg.channel.send(exampleEmbed);
                    }
                }
            } catch (e) {
                if (doReply) {
                    msg.reply("Oops, there seems to be something wrong there. \nChoose your question with ***question questionNumber***, e.g. **question 1**\nYou can get the question number via **list**");
                } else {
                    msg.reply("Oops, there seems to be something wrong there. \nChoose your question with ***!FAQ question questionNumber***, e.g. **question 1**\nYou can get the question number if you send me **list** in DM");
                }
            }
        }

    }
)

function getNumberLabel(labelValue) {

    // Nine Zeroes for Billions
    return Math.abs(Number(labelValue)) >= 1.0e+9

        ? Math.round(Math.abs(Number(labelValue)) / 1.0e+9) + "B"
        // Six Zeroes for Millions
        : Math.abs(Number(labelValue)) >= 1.0e+6

            ? Math.round(Math.abs(Number(labelValue)) / 1.0e+6) + "M"
            // Three Zeroes for Thousands
            : Math.abs(Number(labelValue)) >= 1.0e+3

                ? Math.round(Math.abs(Number(labelValue)) / 1.0e+3) + "K"

                : Math.abs(Number(labelValue));

}

setInterval(function () {
    https.get('https://api.coingecko.com/api/v3/coins/ethereum', (resp) => {
        let data = '';

        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
            let result = JSON.parse(data);
            ethPrice = result.market_data.current_price.usd;
        });

    }).on("error", (err) => {
        console.log("Error: " + err.message);
    });

}, 60 * 1000);

setInterval(function () {
    https.get('https://api.coingecko.com/api/v3/coins/switcheo', (resp) => {
        let data = '';

        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
            let result = JSON.parse(data);
            swthPrice = result.market_data.current_price.usd;
            swthPrice = Math.round(((swthPrice * 1.0) + Number.EPSILON) * 1000) / 1000;

        });

    }).on("error", (err) => {
        console.log("Error: " + err.message);
    });

}, 60 * 1000);

function handleGasSubscription() {
    https.get('https://gasprice.poa.network/', (resp) => {
        let data = '';

        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
            let result = JSON.parse(data);
            gasPrice = result.standard;
            gasSubscribersMap.forEach(function (value, key) {
                try {
                    if ((result.standard * 1.0) < (value * 1.0)) {
                        if (gasSubscribersLastPushMap.has(key)) {
                            var curDate = new Date();
                            var lastNotification = new Date(gasSubscribersLastPushMap.get(key));
                            var hours = Math.abs(curDate - lastNotification) / 36e5;
                            if (hours > 1) {
                                if (client.users.cache.get(key)) {
                                    client.users.cache.get(key).send('gas price is now below your threshold. Current safe gas price is: ' + result.standard);
                                    gasSubscribersLastPushMap.set(key, new Date().getTime());
                                    if (process.env.REDIS_URL) {
                                        redisClient.set("gasSubscribersMap", JSON.stringify([...gasSubscribersMap]), function () {
                                        });
                                        redisClient.set("gasSubscribersLastPushMap", JSON.stringify([...gasSubscribersLastPushMap]), function () {
                                        });
                                    }
                                } else {
                                    console.log("User:" + key + " is no longer in this server");
                                    gasSubscribersLastPushMap.delete(key);
                                    gasSubscribersMap.delete(key);
                                    if (process.env.REDIS_URL) {
                                        redisClient.set("gasSubscribersMap", JSON.stringify([...gasSubscribersMap]), function () {
                                        });
                                        redisClient.set("gasSubscribersLastPushMap", JSON.stringify([...gasSubscribersLastPushMap]), function () {
                                        });
                                    }
                                }
                            } else {
                                console.log("Not sending a gas notification for: " + key + "because " + lastNotification + " was less than 1 h ago from current date:" + curDate);
                            }
                        } else {
                            if (client.users.cache.get(key)) {
                                client.users.cache.get(key).send('gas price is now below your threshold. Current safe gas price is: ' + result.standard);
                                gasSubscribersLastPushMap.set(key, new Date());
                                if (process.env.REDIS_URL) {
                                    redisClient.set("gasSubscribersMap", JSON.stringify([...gasSubscribersMap]), function () {
                                    });
                                    redisClient.set("gasSubscribersLastPushMap", JSON.stringify([...gasSubscribersLastPushMap]), function () {
                                    });
                                }
                            } else {
                                console.log("User:" + key + " is no longer in this server");
                                gasSubscribersLastPushMap.delete(key);
                                gasSubscribersMap.delete(key);
                                if (process.env.REDIS_URL) {
                                    redisClient.set("gasSubscribersMap", JSON.stringify([...gasSubscribersMap]), function () {
                                    });
                                    redisClient.set("gasSubscribersLastPushMap", JSON.stringify([...gasSubscribersLastPushMap]), function () {
                                    });
                                }
                            }
                        }
                    } else {
                        //console.log("Not sending a gas notification for: " + key + " because " + value + " is below gas " + result.standard);
                    }
                } catch (e) {
                    console.log("Error occured when going through subscriptions for key: " + key + "and value " + value + " " + e);
                }
            });

        });

    }).on("error", (err) => {
        console.log("Error: " + err.message);
    });

}

setInterval(handleGasSubscription, 60 * 1000);


const puppeteer = require('puppeteer');

async function getStakingInfo() {
    try {
        const browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        });
        const page = await browser.newPage();
        await page.setViewport({width: 1000, height: 926});
        await page.goto("https://switcheo.org/", {waitUntil: 'networkidle2'});

        await delay(4000);

        await page.screenshot({path: 'screenshot.png'});

        /** @type {string[]} */
        var prices = await page.evaluate(() => {

            var div = document.querySelectorAll('div.c513');

            var prices = []
            div.forEach(element => {
                prices.push(element.textContent);
            });

            div = document.querySelectorAll('div.c516');

            div.forEach(element => {
                prices.push(element.textContent);
            });

            return prices
        })

        stakingAPR = prices[1];
        bondedSwth = prices[2];
        activeValidators = prices[3];
        marketCap = prices[5];
        totalSupply = prices[6];
        tradeHubSupply = prices[7];
        totalSupply = replaceString(totalSupply, "SWTH", " SWTH");
        tradeHubSupply = replaceString(tradeHubSupply, "SWTH", " SWTH");
        browser.close()
    } catch (e) {
        console.log("Error happened on getting data from https://switcheo.org/.");
        console.log(e);
    }
}

function delay(time) {
    return new Promise(function (resolve) {
        setTimeout(resolve, time)
    });
}

function getValidators() {
    https.get('https://tradescan.switcheo.org/staking/validators', (resp) => {
        let data = '';

        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
            validators = JSON.parse(data).result;
            var totalFee = 0;
            validators.forEach(v => {
                let fee = v.commission.commission_rates.rate * 100;
                fee = Math.round(((fee) + Number.EPSILON) * 100) / 100;
                totalFee += fee;
            })
            avgFee = totalFee / validators.length;
            avgFee = Math.round(((avgFee) + Number.EPSILON) * 100) / 100;
        });

    }).on("error", (err) => {
        console.log("Error getting validators: " + err.message);
    });
}

setInterval(function () {
    https.get('https://api.coingecko.com/api/v3/coins/switcheo', (resp) => {
        let data = '';

        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
            let result = JSON.parse(data);
            coingeckoUsd = result.market_data.current_price.usd;
            coingeckoEth = result.market_data.current_price.eth;
            coingeckoBtc = result.market_data.current_price.btc;
        });

    }).on("error", (err) => {
        console.log("Error: " + err.message);
    });
}, 10 * 1000);


function doCalculate(command, msg, feeParam, fromDM) {
    // deduct 7% for validator fee
    let bondedNumber = bondedSwth.trim().replace(/%/g, "");
    var diff = (new Date().getTime() - start.getTime()) / 1000;
    diff /= (60 * 60 * 24 * 7);
    var weeksDif = Math.abs(Math.round(diff));
    var quotientNow = quotient - (weeksDif * 0.0316 / 100)
    let validatorFee = avgFee;
    if (feeParam) {
        validatorFee = 1 - feeParam.replace('%', '') / 100;
    }
    let result = Math.round(((validatorFee * command * 100 * quotientNow / bondedNumber) + Number.EPSILON) * 100) / 100;
    let resRewInUsd = Math.round(((result * coingeckoUsd) + Number.EPSILON) * 100) / 100;
    const exampleEmbed = new Discord.MessageEmbed()
        .setColor('#0099ff')
        .setTitle('Calculated rewards:');
    exampleEmbed.addField("SWTH weekly rewards", "You are expected to receive **" + result + "** SWTH for this week for **" + command + "** staked SWTH"
        + "\n The estimated value of SWTH rewards is: **$" + resRewInUsd + "**");
    exampleEmbed.addField("Calculation info",
        "Planned weekly inflation: **" + (Math.round(((quotientNow * 100) + Number.EPSILON) * 100) / 100) + "%**\n"
        + "Staked swth percentage: **" + bondedSwth + "**\n"
        + "Actual weekly staking rate **" + (Math.round(((quotientNow * 100 * 100 / bondedNumber) + Number.EPSILON) * 100) / 100) + "%**\n"
        + "Swth price: **$" + coingeckoUsd + "**\n"
        + "Averaged validator fee: **" + (100-validatorFee * 100) + "%**");
    exampleEmbed.addField("General info",
        "Total supply: **" + totalSupply + "**\n"
        + "Tradehub supply: **" + tradeHubSupply + "**\n"
        + "Staking APR: **" + stakingAPR + "**\n"
        + "Market cap: **" + marketCap + "**\n"
        + "Active validators: **" + activeValidators + "**");
    msg.reply(exampleEmbed);
}

function doShowChart(type, msg, fromDM) {
    try {
        const exampleEmbed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle(type + ' SWTH price chart');
        exampleEmbed.addField("Possible options:", "realtime, 24H, 7D, 1M, 3M, 6M, YTD, 1Y, ALL");
        exampleEmbed.attachFiles(['charts/chart' + type.toLowerCase() + '.png'])
            .setImage('attachment://' + 'chart' + type.toLowerCase() + '.png');
        msg.reply(exampleEmbed);
    } catch (e) {
        console.log("Exception happened when showing the chart");
        console.log(e);
    }
}

function doShowExchangeChart(type, msg, fromDM) {
    try {
        const exampleEmbed = new Discord.MessageEmbed()
            .setColor('#0099ff')
            .setTitle(type + ' SWTH exchange volume chart');
        exampleEmbed.addField("Possible options:", "24h, 7d, 14d, 30d, 3m, 1y");
        exampleEmbed.attachFiles(['charts/exchangechart' + type.toLowerCase() + '.png'])
            .setImage('attachment://' + 'exchangechart' + type.toLowerCase() + '.png');
        msg.reply(exampleEmbed);
    } catch (e) {
        console.log("Exception happened when showing the chart");
        console.log(e);
    }
}

async function getChart(type) {
    try {
        const browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        });
        const page = await browser.newPage();
        await page.setViewport({width: 1000, height: 926});
        await page.goto("https://coincodex.com/crypto/switcheo/?period=" + type, {waitUntil: 'networkidle2'});
        await page.waitForSelector('.chart');

        const rect = await page.evaluate(() => {
            const element = document.querySelector('.chart');
            const {x, y, width, height} = element.getBoundingClientRect();
            return {left: x, top: y, width, height, id: element.id};
        });

        await page.screenshot({
            path: 'charts/chart' + type.toLowerCase() + '.png',
            clip: {
                x: rect.left - 0,
                y: rect.top - 0,
                width: rect.width + 0 * 2,
                height: rect.height + 0 * 2
            }
        });
        browser.close();
    } catch (e) {
        console.log("Error happened on getting chart.");
        console.log(e);
    }
}


setTimeout(function () {
    getChart('realtime');
}, 1 * 1000);
setTimeout(function () {
    getChart('24H');
}, 5 * 1000);
setTimeout(function () {
    getChart('7D');
}, 10 * 1000);
setTimeout(function () {
    getChart('1M');
}, 20 * 1000);
setTimeout(function () {
    getChart('3M');
}, 30 * 1000);
setTimeout(function () {
    getChart('6M');
}, 40 * 1000);
setTimeout(function () {
    getChart('YTD');
}, 50 * 1000);
setTimeout(function () {
    getChart('1Y');
}, 60 * 1000);
setTimeout(function () {
    getChart('ALL');
}, 70 * 1000);


setInterval(function () {
    getChart('realtime');
}, 60 * 3 * 1000);
setInterval(function () {
    getChart('24H');
}, 60 * 7 * 1000);
setInterval(function () {
    getChart('7D');
}, 60 * 10 * 1000);
setInterval(function () {
    getChart('1M');
}, 60 * 20 * 1000);
setInterval(function () {
    getChart('3M');
}, 60 * 25 * 1000);
setInterval(function () {
    getChart('6M');
}, 60 * 50 * 1000);
setInterval(function () {
    getChart('YTD');
}, 60 * 50 * 1000);
setInterval(function () {
    getChart('1Y');
}, 60 * 50 * 1000);
setInterval(function () {
    getChart('ALL');
}, 60 * 100 * 1000);


async function getExchangeChart(type) {
    try {
        const browser = await puppeteer.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ],
        });
        const page = await browser.newPage();
        await page.setViewport({width: 1000, height: 926});
        await page.goto("https://www.coingecko.com/en/exchanges/switcheo#statistics", {waitUntil: 'networkidle2'});
        await page.waitForSelector('#cookie-notice');
        await page.click('#cookie-notice a.btn');
        await page.waitForSelector('.highcharts-container');
        await delay(2000);

        if (type.includes('7d')) {
            await page.click('.graph-stats-btn-7d');
            await delay(5000);
        }
        if (type.includes('14d')) {
            await page.click('.graph-stats-btn-7d');
            await delay(5000);
        }
        if (type.includes('30d')) {
            await page.click('.graph-stats-btn-7d');
            await delay(5000);
        }
        if (type.includes('3m')) {
            await page.click('.graph-stats-btn-7d');
            await delay(5000);
        }
        if (type.includes('1y')) {
            await page.click('.graph-stats-btn-7d');
            await delay(5000);
        }

        const rect = await page.evaluate(() => {
            const element = (document.querySelectorAll('.highcharts-container')[2]);
            const {x, y, width, height} = element.getBoundingClientRect();
            return {left: x, top: y + 700, width, height, id: element.id};
        });

        await page.screenshot({
            path: 'charts/exchangechart' + type.toLowerCase() + '.png',
            clip: {
                x: rect.left - 0,
                y: rect.top - 0,
                width: rect.width + 0 * 2,
                height: rect.height + 0 * 2
            }
        });
        console.log("Saved exchange chart: " + type);
        browser.close();
    } catch (e) {
        console.log("Error happened on getting chart.");
        console.log(e);
    }
}

setTimeout(function () {
    getExchangeChart('24h');
}, 5 * 1000);

setInterval(function () {
    getExchangeChart('24h');
}, 1 * 1000 * 60);

setTimeout(function () {
    getExchangeChart('7d');
}, 20 * 1000);

setInterval(function () {
    getExchangeChart('7d');
}, 10 * 1000 * 60);

setTimeout(function () {
    getExchangeChart('14d');
}, 30 * 1000);

setInterval(function () {
    getExchangeChart('14d');
}, 12 * 1000 * 60);

setTimeout(function () {
    getExchangeChart('30d');
}, 40 * 1000);

setInterval(function () {
    getExchangeChart('30d');
}, 15 * 1000 * 60);

setTimeout(function () {
    getExchangeChart('1m');
}, 50 * 1000);

setInterval(function () {
    getExchangeChart('1m');
}, 20 * 1000 * 60);

setTimeout(function () {
    getExchangeChart('1y');
}, 60 * 1000);

setInterval(function () {
    getExchangeChart('1y');
}, 100 * 1000 * 60);

setTimeout(getStakingInfo, 10 * 1000);
setInterval(getStakingInfo, 60 * 1000);

setInterval(getValidators, 20 * 1000);

client.login(process.env.BOT_TOKEN);
