import admin from "firebase-admin";

function getServiceAccount() {

  return {
   projectId : "ellabache-singleview",
  clientEmail : process.env.GCP_FIREBASE_CLIENT_EMAIL,
  privateKey : process.env.GCP_FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),

  }
 
}
// Prevent multiple initialization (important for Shopify/Remix apps)
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(getServiceAccount()),
  });
}





export const firestore = admin.firestore();
export const firestoreTimestamp = admin.firestore.Timestamp.now;
export const serverTimestamp = admin.firestore.FieldValue.serverTimestamp;
