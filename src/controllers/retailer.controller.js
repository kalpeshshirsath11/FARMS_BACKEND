const FarmerStock = require('../models/FarmerStock.js')

const getStock = async(req,res)=>{
    //1.check for authentication and is user retailer using middleweres
    //2. get all stocks from poststock database
    //3.only send usaefull data to a retailer
    const StockData = await FarmerStock.find({});
    return res.status(201).json({
        StockData
    })
}

module.exports = {getStock}