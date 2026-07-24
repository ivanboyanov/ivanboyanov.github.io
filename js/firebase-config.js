// 1) Fertige Konfiguration der Firebase-Web-App "Verbfit-deutsch".
// 2) Die Firebase-Konfiguration ist kein geheimes Passwort und darf im Browser stehen.
// 3) Der Adminzugang wird NICHT über den Namen oder ein Passwort im Code vergeben,
//    sondern einmalig über das Dokument /admins/DEINE_UID in Firestore.

export const firebaseConfig = {
  apiKey: "AIzaSyBTNOHUSYK75NV6GtVyLeekvPKi-sswJjA",
  authDomain: "verbfit---deutsch.firebaseapp.com",
  projectId: "verbfit---deutsch",
  storageBucket: "verbfit---deutsch.firebasestorage.app",
  messagingSenderId: "242756559973",
  appId: "1:242756559973:web:30a0db8744cf794bfa128c",
  measurementId: "G-QSQJJ8FL3N"
};

export const ADMIN_DISPLAY_NAME = "Ivan Boyanov";

export const firebaseConfigured = !Object.values(firebaseConfig).some(value =>
  typeof value !== "string" || value.startsWith("PASTE_")
);
