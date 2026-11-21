// Public browser configuration only. Never put a Supabase service-role key here.
export const SUPABASE_URL = "https://gzyluszzrrlhqcwoilfr.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_T22ecdd7VLf91L8TqN4jug_N9AQea2m";

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
