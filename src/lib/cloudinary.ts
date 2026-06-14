const CLOUDINARY_UPLOAD_TIMEOUT_MS = 30000;
const env = (import.meta.env as Record<string, string | undefined>) ?? {};

const getCloudinaryConfig = () => ({
  cloudName: (env.VITE_CLOUDINARY_CLOUD_NAME || '').trim(),
  uploadPreset: (env.VITE_CLOUDINARY_UPLOAD_PRESET || '').trim(),
  folder: (env.VITE_CLOUDINARY_UPLOAD_FOLDER || 'sumjay/students').trim(),
});

export async function uploadStudentPhotoToCloudinary(file: File) {
  const { cloudName, uploadPreset, folder } = getCloudinaryConfig();
  if (!cloudName || !uploadPreset) {
    throw new Error('MISSING_CLOUDINARY_CONFIG');
  }

  const endpoint = `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`;
  const body = new FormData();
  body.append('file', file);
  body.append('upload_preset', uploadPreset);
  if (folder) {
    body.append('folder', folder);
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CLOUDINARY_UPLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      body,
      signal: controller.signal,
    });

    if (!response.ok) {
      let details = '';
      try {
        const errorBody = await response.json();
        details = errorBody?.error?.message ? `: ${errorBody.error.message}` : '';
      } catch {
        // No-op: keep generic message.
      }
      throw new Error(`CLOUDINARY_UPLOAD_FAILED${details}`);
    }

    const data = (await response.json()) as { secure_url?: string };
    if (!data.secure_url) {
      throw new Error('CLOUDINARY_UPLOAD_NO_URL');
    }

    return data.secure_url;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error('CLOUDINARY_UPLOAD_TIMEOUT');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}
