const mongoose = require("mongoose")

const userSchema = new mongoose.Schema({
    firstName:{
        type:String,
        trim:true,
        required:true
    },
    lastName:{
        type:String,
        trim:true,
        required:true
    },
    contactNumber:{
        type:String,
        required:true,
        trim:true
    },
    accountType:{
        type:String,
        enum:["Farmer", "Retailer", "Transporter", "Admin"],
        required:true
    },
    password:{
        type:String,
        required:true
    },
    
    profilePhoto:{
        type:String, //image url
        // required: true
    },
    //Below two fields will be used for the reset password functionality 
    token:{
        type:String
    },
    resetPasswordExpires:{
        type:Date
    },
    averageRating:{
        type:Number,
        default:0
    },
    reviewCount:{
        type:Number,
        default:0
    }    
},
{
    timestamps: true, //This automatically adds createdAt and updatedAt fields to your schema and updates the updatedAt field whenever the document is modified.
}
);

module.exports = mongoose.model("User", userSchema);
