const express = require("express");
require("dotenv").config();

const PORT = process.env.PORT || 8000;
const app = express();





app.use(express.urlencoded({extended:false}));
app.use(express.json());

app.listen(PORT|8000, () => {
  console.log(`Server is running on port ${PORT}`);
});
