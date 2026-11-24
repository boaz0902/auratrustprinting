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

export const orderLimits = {
  maxFileSizeMB: 10,
  maxFiles: 10,
  maxTotalSizeMB: 40
};

export const fileTypeCategories = {
  Documents: ["docx", "doc", "pdf", "pptx", "ppt", "xlsx", "xls", "csv", "txt", "odt", "rtf"],
  Images: ["png", "jpg", "jpeg", "webp", "gif", "heic", "bmp", "svg", "tiff"],
  "Design / other": ["psd", "ai", "cdr", "eps", "zip"]
};
