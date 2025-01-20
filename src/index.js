const express = require("express");
require("dotenv").config();
const {dbConnection} = require("./config/database.js")
const {cloudinaryConnect} = require("./config/cloudinary.js")
const userRoute = require("./routes/user.routes.js");
const cookieParser = require("cookie-parser");
const PORT = process.env.PORT || 7000;
const app = express();

// Middleware
app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(cookieParser())

// app.listen(PORT, () => {
//   console.log(`App is listening at ${PORT}`);
// })

cloudinaryConnect();

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