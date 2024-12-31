const express = require("express");
require("dotenv").config();
const { dbConnection } = require("./db.js"); 
const userRoute = require("./routes/user.routes.js")
const PORT = process.env.PORT || 8000;
const app = express();

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());




dbConnection()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.log("Error occurred in server starting process:", err);
  });
app.use("/api",userRoute);