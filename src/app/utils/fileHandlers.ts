import { MedicalAttachment } from "../types";

export const convertFileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
};

export const downloadFile = (attachment: MedicalAttachment) => {
  const link = document.createElement('a');
  // El contenido del adjunto vive en fileUrl (data URI base64), no en fileData
  link.href = attachment.fileUrl;
  link.download = attachment.fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export const getFileIcon = (fileType: string): string => {
  if (fileType.startsWith('image/')) return '🖼️';
  if (fileType === 'application/pdf') return '📄';
  if (fileType.startsWith('video/')) return '🎥';
  return '📎';
};

export const isValidFileType = (file: File): boolean => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/jpg',
    'application/pdf',
    'image/gif',
    'video/mp4',
    'video/quicktime'
  ];
  return allowedTypes.includes(file.type);
};

export const isValidFileSize = (file: File): boolean => {
  const maxSize = 1 * 1024 * 1024; // 1 MB
  return file.size <= maxSize;
};
