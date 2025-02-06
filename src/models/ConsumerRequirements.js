const mongoose = require("mongoose")

const consumerRequirementSchema = new mongoose.Schema({
    crop:{
        type:String,
        required:true,
        trim:true
    },
    quantity:{
        type:Number,
        required:true
    },
    expectedDeliveryDate:{
        type:Date,
        required:true
    },
    location:{
        type:{
            type:String,
            enum:['Point'],
            required:true
        },
        coordinates:{
            type:[Number],
            required:true
        },
        address:{
            type:String,
            required:true
        }
    },
    clubbedGroupId:{
        type:String
    } 
},
{
    timestamps:true
})


module.exports = mongoose.model("ConsumerRequirements", consumerRequirementSchema);