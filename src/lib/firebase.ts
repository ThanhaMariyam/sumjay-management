import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { getFirestore, onSnapshot, collection, query, where, getDocs, doc, setDoc, deleteDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { getDownloadURL, getStorage, ref, uploadBytes } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
// CRITICAL: The app will break without specifying the database Id
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();

export const loginWithGoogle = async () => {
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (error) {
    const code =
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      typeof (error as { code?: string }).code === 'string'
        ? (error as { code: string }).code
        : '';

    if (code.includes('auth/popup-blocked') || code.includes('auth/popup-closed-by-user')) {
      // Popup auth can fail in some browsers/embedded contexts.
      await signInWithRedirect(auth, googleProvider);
      return;
    }

    throw error;
  }
};

const normalizeIdentifier = (identifier: string) => {
  const cleaned = identifier.trim().toLowerCase();
  if (cleaned.includes('@')) {
    return cleaned;
  }
  return `${cleaned}@sumjay.club`;
};

export const loginWithCredentials = async (identifier: string, password: string) => {
  const email = normalizeIdentifier(identifier);
  return signInWithEmailAndPassword(auth, email, password);
};

export const signupWithCredentials = async (
  identifier: string,
  password: string,
  displayName?: string,
) => {
  const email = normalizeIdentifier(identifier);
  const result = await createUserWithEmailAndPassword(auth, email, password);
  if (displayName?.trim()) {
    await updateProfile(result.user, { displayName: displayName.trim() });
  } else {
    await updateProfile(result.user, { displayName: identifier.trim() });
  }
  return result;
};

export const logout = async () => {
  try {
    await signOut(auth);
  } catch (error) {
    console.error("Error logging out", error);
    throw error;
  }
};

const sanitizeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

export const uploadStudentPhoto = async (file: File, adminId: string, timeoutMs = 30000) => {
  const filePath = `students/${adminId}/${Date.now()}_${sanitizeFileName(file.name)}`;
  const fileRef = ref(storage, filePath);

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('PHOTO_UPLOAD_TIMEOUT')), timeoutMs);
  });

  try {
    await Promise.race([
      uploadBytes(fileRef, file, {
        contentType: file.type || 'application/octet-stream',
      }),
      timeoutPromise,
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  return getDownloadURL(fileRef);
};

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo, null, 2));
  throw new Error(JSON.stringify(errInfo));
}
