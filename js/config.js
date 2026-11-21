// Public business details and Firebase web configuration live here.
// Replace the Firebase placeholders with the values from your Firebase project.
export const businessInfo = {
  address: "Add your shop address",
  phone: "+63 900 000 0000",
  email: "hello@auratrust.example",
  facebookUrl: "https://facebook.com/",
  facebookName: "AuraTrust Printing & Digital Services",
  hours: "Monday–Saturday, 8:00 AM–6:00 PM"
};

export const gcashInfo = {
  name: "AuraTrust Printing",
  number: "0900 000 0000",
  qrPath: "assets/gcash-qr.png"
};

export const orderLimits = {
  maxFileSizeMB: 25,
  maxFiles: 10,
  allowedExtensions: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "jpg", "jpeg", "png", "webp", "txt"],
  allowedMimeTypes: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "image/jpeg",
    "image/png",
    "image/webp",
    "text/plain"
  ]
};

export const firebaseConfig = {
  apiKey: "AIzaSyAH5ycJgbT6gYvJ6YsizLLijbHIgZxAb-c",
  authDomain: "printer-2202d.firebaseapp.com",
  projectId: "printer-2202d",
  storageBucket: "printer-2202d.firebasestorage.app",
  messagingSenderId: "524759267518",
  appId: "1:524759267518:web:13223221aacb39aa9b86ef",
  measurementId: "G-RZHPS812ZG"
};

export const adminEmail = "auratrustprinting@gmail.com";
