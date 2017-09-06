'use strict';

const Alexa = require('alexa-sdk');
const RC = require('ringcentral');
var unitsThMap = [ "first","second","third","fourth","fifth","sixth","seventh","eighth","ninth","tenth","eleventh", "twelfth", "thirteenth", "fourteenth", "fifteenth","sixteenth","seventeenth","eighteenth","nineteenth" ]
var tensThMap = [ "tenth", "twentieth", "thirtieth", "fortieth", "fiftieth", "sixtieth", "seventieth", "eightieth", "ninetieth" ]

var rcsdk = new RC({
    server: RC.server.sandbox,
    appKey: process.env.RC_APP_KEY,
    appSecret: process.env.RC_APP_SECRET
});
var platform = rcsdk.platform();

var speech_output = ""
var reprompt_text = ""

exports.handler = function(event, context){
    var alexa = Alexa.handler(event, context);
    alexa.appId = process.env.AppID;
    alexa.registerHandlers(handlers);
    alexa.execute();
};

var handlers = {
    'LaunchRequest' : function () {
        if (this.event.session.user.accessToken == undefined) {
            this.emit(':tellWithLinkAccountCard',
                     'to start using this skill, please use the companion app to authenticate on RingCentral');
            return;
        }

        var data = platform.auth().data();
        data.token_type = "bearer"
        data.expires_in = 86400
        data.refresh_token_expires_in = 86400
        data.access_token = this.event.session.user.accessToken
        platform.auth().setData(data)
        var thisHandler = this
        platform.get('/account/~/extension/~/')
          .then(function(response) {
              var jsonObj =response.json();
              thisHandler.attributes['extensionNumber'] = jsonObj.extensionNumber
              thisHandler.attributes['userName'] = jsonObj.name
              platform.get('/account/~/extension/' + jsonObj.id + '/phone-number')
                .then(function(response) {
                    var jsonObj =response.json();
                    var count = jsonObj.records.length
                    for (var record of jsonObj.records){
                        if (record.usageType == "DirectNumber"){
                            thisHandler.attributes['ownPhoneNumber'] = record.phoneNumber.replace("+", "")
                            break;
                        }
                    }
                    // should check if there is no direct number
                    if (!thisHandler.attributes['ownPhoneNumber']) {
                       speech_output = "Hi "
                       speech_output += thisHandler.attributes['userName']
                       speech_output += "Unfortunately, your account does not support SMS message."
                       thisHandler.emit(':tell', speech_output)
                    }else{
                       speech_output = "Hi "
                       speech_output += thisHandler.attributes['userName']
                       speech_output += ". How can I help you?"
                       reprompt_text = "How can I help you?"
                       thisHandler.emit(':ask', speech_output, reprompt_text)
                    }
                })
                .catch(function(e) {
                    console.log("Failed")
                    console.error(e);
                    thisHandler.emit(':tell', "Fail to read your account. Please try again.")
                    throw e;
                });
          })
          .catch(function(e) {
              console.log("Failed")
              console.error(e);
              thisHandler.emit(':tell', "Fail to read your account. Please try again.")
              throw e;
          });
    },
    'UnexpectedIntent': function () {
        // This is a workaround solution to avoid Alexa invoking the GetUnreadTextMessageIntent
        // with undefined utterances.
        this.emit('Unhandled');
    },
    'GetUnreadTextMessageIntent': function () {
        this.attributes['index'] = 0
        this.attributes['textMsgs'] = []
        var params = {}
        params['messageType'] = "SMS"
        params['readStatus'] = "Unread"
        params['direction'] = "Inbound"
        var thisHandler = this
        platform.get('/account/~/extension/~/sms', params)
         .then(function (response) {
            var jsonObj =response.json();
            var count = jsonObj.records.length
            if (count > 0){
                for (var i=count-1; i>=0; i--) {
                    var record = jsonObj.records[i]
                    var message = {}
                    message['id'] = record.id
                    if ("name" in record.from){
                       message['from'] = record.from.name
                    }else{
                       message['from'] = getNumberAsString(record.from.phoneNumber)
                    }
                    message['fromNumber'] = record.from.phoneNumber
                    var body = record.subject
                    var watermark = "Test SMS using a RingCentral Developer account - "
                    var index = body.indexOf(watermark)
                    var payload = body;
                    if (index > -1) {
                        payload = body.substr(watermark.length, body.length)
                    }
                    message['subject'] = payload
                    thisHandler.attributes['textMsgs'].push(message)
                }
                thisHandler.attributes['index'] = -1;
                thisHandler.emit('ReadTextMessageIntent')
            }else{
                thisHandler.emit(':tell', "You have no unread message.");
            }
        });
    },
    'ReplyTextMessageIntent': function () {
        if (!this.attributes['textMsgs'] || this.attributes['textMsgs'].length == 0) {
            return this.emit(':ask', "Please say read message then listen to a message and say reply.");
        }
        var count = this.attributes['textMsgs'].length
        if (this.attributes['index'] >= count){
            // no more message
            this.emit(':tell', "out of range");
        }else{
            var message = this.attributes['textMsgs'][this.attributes['index']]
            speech_output = "Reply to " + message['from'] + ". Now you can say message body, followed by the message you want to send."
            this.attributes['message'] = ""
            this.attributes['toNumber'] = message['fromNumber'];
            this.emit(':ask', speech_output, speech_output);
        }
    },
    'ReadTextMessageIntent': function () {
        if (!this.attributes['textMsgs'] || this.attributes['textMsgs'].length == 0) {
            return this.emit(':ask', "Please say get unread message to check for new messages.");
        }
        var count = this.attributes['textMsgs'].length
        var index = this.attributes['index']
        if (index >= count-1){
            // no more message
            return this.emit(':ask', "There is no more unread message. You can say reply, or get unread message to check for new messages.", "How can I help you?");
        }
        this.attributes['index']++
        var msg = this.attributes['textMsgs'][this.attributes['index']]
        var prefix = ""
        if (this.attributes['index'] == 0){
            if (count == 1)
                prefix = "You have 1 unread message "
            else {
                prefix = "You have " + count + " unread messages. First message "
            }
        }else{
            if (this.attributes['index'] == count - 1)
                prefix = "Last message "
            else {
                prefix = convertNumtoOrder(this.attributes['index']) + " unread message "
            }
        }
        speech_output = prefix
        speech_output += "from " + msg['from']
        speech_output += ". Message. " + msg['subject'] + ". "
        if (this.attributes['index'] < count) {
            speech_output += "You can say reply or next message. "
            reprompt_text = "You can say reply or next message."
        }
        else {
            speech_output += "You can say reply or I am done."
            reprompt_text = "How can I help you?"
        }
        var thisHandler = this
        platform.put('/account/~/extension/~/message-store/' + msg['id'], {
             readStatus: "Read"
            })
            .then(function (response) {
                thisHandler.emit(':ask', speech_output, reprompt_text);
            })
            .catch(function(e) {
                console.log("Failed to set readStatus")
                console.error(e);
            });
    },
    'TextMessageIntent': function () {
        var intent = this.event.request.intent;
        if ('MessageBody' in intent.slots) {
            var message = intent.slots.MessageBody.value
            this.attributes['message'] = message
            speech_output = "I repeat your message. " + message + ". Do you want to send it now?"
            reprompt_text = "Say yes to send the message or say no to cancel."
            this.emit(':ask', speech_output, reprompt_text);
        }else{
            speech_output = "Message is empty. Please try again."
            reprompt_text = "You can say, message body, followed by the text message you want to send."
            this.emit(':ask', speech_output, reprompt_text);
        }
    },
    'AMAZON.YesIntent': function () {
        if (this.attributes['message']){
            if (this.attributes['message'].length > 0) {
                var thisHandler = this
                platform.post('/account/~/extension/~/sms', {
                  from: {'phoneNumber': this.attributes['ownPhoneNumber']},
                  to: [{'phoneNumber': this.attributes['toNumber']}],
                  text: this.attributes['message']
                  })
                  .then(function (response) {
                    speech_output = "Message is sent. "
                    var count = thisHandler.attributes['textMsgs'].length
                    if (thisHandler.attributes['index'] < count - 1) {
                      speech_output += "You can say next to listen to the next message"
                      reprompt_text = "You can say next to listen to the next message"
                    }else{
                      speech_output += "No more unread message. You can say get message to check for new unread messages."
                      reprompt_text = "How can I help you?"
                    }
                    thisHandler.emit(':ask', speech_output, reprompt_text);
                  })
                  .catch(function(e) {
                      console.log("Failed to send message")
                      console.error(e);
                      thisHandler.emit(':ask', "Sorry, I cannot send the message. Please try again", "Say message body, followed by the text message you want to send.");
                  });
            }else{
                speech_output = "Say message body, followed by the text message you want to send."
                this.emit(':ask', speech_output, speech_output);
            }
        }else{
            speech_output = 'Sorry, I don\'t understand what you want me to do. Please say help to hear what you can say.';
            this.emit(':ask', speech_output, speech_output)
        }
    },
    'AMAZON.NoIntent': function () {
        if (this.attributes['message'] && this.attributes['message'].length > 0){
           speech_output = "If you want to change the message, say message body, followed by the text message you want to send."
           reprompt_text = 'How can I help you?'
        }else{
           speech_output = 'How can I help you?'
           reprompt_text = 'How can I help you?'
        }
        this.emit(':ask', speech_output, reprompt_text)
    },
    'DoneIntent': function () {
        this.emit(':tell', 'Good bye');
    },
    'AMAZON.HelpIntent': function () {
        this.emit(':ask', 'Say get unread message to fetch new unread text messages.', "How can I help you?");
    },
    'Unhandled': function () {
        speech_output = 'Sorry, I don\'t understand what you want me to do. Please say help to hear what you can say.';
        this.emit(':ask', "Sorry, I do not understand what you said", "How can I help you?")
    }
 };

function localAuthenticate() {
     var data = platform.auth().data();
     data.token_type = "bearer"
     data.expires_in = 86400
     data.refresh_token_expires_in = 86400
     data.access_token = this.event.session.user.accessToken
     platform.auth().setData(data)
     var thisHandler = this
     platform.get('/account/~/extension/~/')
       .then(function(response) {
           var jsonObj =response.json();
           thisHandler.attributes['extensionNumber'] = jsonObj.extensionNumber
           thisHandler.attributes['userName'] = jsonObj.name
           platform.get('/account/~/extension/' + jsonObj.id + '/phone-number')
             .then(function(response) {
                 var jsonObj =response.json();
                 var count = jsonObj.records.length
                 for (var record of jsonObj.records){
                     if (record.usageType == "DirectNumber"){
                         thisHandler.attributes['ownPhoneNumber'] = record.phoneNumber.replace("+", "")
                         break;
                     }
                 }
                 // should check if there is no direct number
                 if (!thisHandler.attributes['ownPhoneNumber']) {
                    speech_output = "Hi "
                    speech_output += thisHandler.attributes['userName']
                    speech_output += "Unfortunately, your account does not support SMS message."
                    thisHandler.emit(':tell', speech_output)
                 }else{
                    speech_output = "Hi "
                    speech_output += thisHandler.attributes['userName']
                    speech_output += ". How can I help you?"
                    reprompt_text = "How can I help you?"
                    thisHandler.emit(':ask', speech_output, reprompt_text)
                 }
             })
             .catch(function(e) {
                 console.log("Failed")
                 console.error(e);
                 thisHandler.emit(':tell', "Fail to read your account. Please try again.")
                 throw e;
             });
       })
       .catch(function(e) {
           console.log("Failed")
           console.error(e);
           thisHandler.emit(':tell', "Fail to read your account. Please try again.")
           throw e;
       });
 }

 function getNumberAsString(number) {
     var numArr = number.split("")
     return numArr.join(" ")
 }
 function convertNumtoOrder(num) {
     var word = ""
     if (num > 0) {
         if (num < 20){
             word = unitsThMap[num];
         }else{
             words = tensThMap[num / 10];
             if ((num % 10) > 0) {
                 words = unitsThMap[num % 10];
             }
         }
     }
     return word;
 }
