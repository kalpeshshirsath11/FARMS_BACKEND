const { upload } = require("../middlewares/multer.middleware");
const FarmerStock = require("../models/FarmerStock");
const { uploadToCloudinary } = require("../utils/uploadToCloudinary");
require("dotenv").config();

exports.postStock = async (req, res) => {
   try{
    const {cropname, cropgrade, quantity, location} = req.body;
    const image = req.files.cropImage.tempFilePath;
    const farmerDetails = req.user;

    if(!cropname || !cropgrade || !quantity || !image || !location){
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

    // Location validations
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

    const uploadedImage = await uploadToCloudinary(image, process.env.CLOUDINARY_FOLDER);
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
        location: location,
    });

    return res.status(200).json({
        success: true,
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


