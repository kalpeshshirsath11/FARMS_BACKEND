// const { ItemAssignmentContextImpl } = require("twilio/lib/rest/numbers/v2/regulatoryCompliance/bundle/itemAssignment");
const { upload } = require("../middlewares/multer.middleware");
const FarmerStock = require("../models/FarmerStock");
const { uploadOnCloudinary } = require("../utils/uploadToCloudinary");
const TransporterDemand = require('../models/TransportRequirements.model.js')
const {getCoordinates} = require('../services/geocodingService.js')
require("dotenv").config();

exports.postStock = async (req, res) => {
   try{
    const {cropname, cropgrade, quantity, location} = req.body;
   
    const farmerDetails = req.user;

    if(!cropname || !cropgrade || !quantity  ){
        return res.status(400).json({
            success:false,
            message:"All fields are required to post stock"
        });
    }

    const quantityValue = Number(quantity);
    if (quantityValue <= 0) {
        return res.status(400).json({
            success: false,
            message: "Quantity must be a positive number",
        });
    }

    //Location validations
    
    
    if (!location || location.type !== "Point") {
        return res.status(400).json({
            success: false,
            message: "Location type must be 'Point'.",
        });
    }

    const [longitude, latitude] = location.coordinates || [];
    if (
        !Array.isArray(location.coordinates) ||
        location.coordinates.length !== 2 ||
        typeof longitude !== "number" ||
        typeof latitude !== "number" ||
        longitude < -180 || longitude > 180 ||
        latitude < -90 || latitude > 90
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid coordinates. Ensure [longitude, latitude] are within valid ranges.",
        });
    }
    const image = req.file.path;
    if(!image){
        return res.json({errr:"Image is required"})
    }
    const uploadedImage = await uploadOnCloudinary(image);
    if (!uploadedImage || !uploadedImage.secure_url) {
        return res.status(500).json({
            success: false,
            message: "Failed to upload image to Cloudinary",
        });
    }

    const newStock = await FarmerStock.create({
        userId: farmerDetails._id,
        crop: cropname, 
        cropGrade: cropgrade,
        quantity: quantity,
        image: uploadedImage.secure_url,
        // location: location,
    });

    return res.status(200).json({
        success: true,
        stock:newStock,
        message: "Stock posted successfully!",
    });
   } catch(error){
    console.log(error);
    return res.status(500).json({
        success: false,
        message: "Error in posting stock",
    });
   }
};


exports.viewMyStock = async (req, res) => {
    try {
        const farmerDetails = req.user;
        const farmerId = farmerDetails._id;

        const myStock = await FarmerStock.find({ userId: farmerId }).sort({createdAt: -1});  //newest first

        if (!myStock || myStock.length === 0) {
            return res.status(404).json({
                success: false,
                message: "No stocks posted yet.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Farmer stocks fetched successfully.",
            stocks: myStock, 
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Error in fetching stocks posted by farmer.",
        });
    }
};
