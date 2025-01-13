const cloudinary = require('cloudinary').v2

exports.uploadToCloudinary = async (file, folder, quality, height) => {
    try{
        const options = {folder};
        options.resource_type = "auto";

        if(quality){
            options.quality = quality;
        }
        if(height){
            options.height = height;
        }

        return await cloudinary.uploader.upload(file.tempFilePath, options)
    } catch(error){
        console.log(error);
        return res.status(500).json({
            success:false,
            message:"Error uploading file to cloudinary"
        })
    }
}