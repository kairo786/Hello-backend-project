//models/Test.js
import mongoose from "mongoose";

const testSchema = new mongoose.Schema({
    with: String, // chat partner email
    messages: [
        {
            sender:String,
            text: String,
            deleted: { type: Boolean, default: false },
            timestamp: { type: Date, default: Date.now }
        }
    ]
});

// यह function हर बार एक dynamic model return करेगा
export const getUserCollection = (userEmail) => {
  const collectionName = userEmail.replace(/[@.]/g, "_");
  if (mongoose.models[collectionName]) {
    return mongoose.models[collectionName]; // already exists, reuse
  }
  return mongoose.model(collectionName, testSchema);
};
