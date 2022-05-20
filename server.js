require('./bot')
require("dotenv").config()
const fileUpload = require('express-fileupload')
const cors = require("cors");
const express = require("express");
const path = require('path')
const app = express(); 

app.use(cors());
app.use(express.json())
app.use(express.static(path.resolve(__dirname, 'static')))
app.use(fileUpload({}))
const runApp = async () => {
    try {
          
                  app.listen(process.env.PORT, () => {
            console.log(`Бот запущено на  5000`);
        })
   
    } catch(err) {
        console.log(err);

        
    }
};
app.get('/', function(req, res) {
  res.sendFile(path.join(__dirname, '/index.html'));
});

runApp();
