const express = require("express");
require("dotenv").config();
const {dbConnection} = require("./config/database.js")
const {cloudinaryConnect} = require("./config/cloudinary.js")
const userRoute = require("./routes/user.routes.js");
const cookieParser = require("cookie-parser");
const PORT = process.env.PORT || 8000;
const app = express();
const farmRoute = require('./routes/farmer.routes.js')
const retailerRoute = require('./routes/retailer.routes.js')
const transportRoute = require('./routes/transporter.routes.js')

// Middlewareeeeee

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use(cookieParser())



app.use("/api",userRoute);
app.use('/farmer',farmRoute)
app.use('/retailer',retailerRoute)
app.use('/transporter',transportRoute)

dbConnection()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.log("Error occurred in server starting process:", err);
  });