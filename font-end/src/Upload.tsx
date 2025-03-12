import { useRef, useState } from 'react';
import axios from 'axios';

const CHUNK_SIZE = 1024 * 1024; // 1MB分块
function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<string | number>(0);
  const [uploading, setUploading] = useState(false);
  const controllerRef = useRef<AbortController>(null);
  const uploadedSizeRef = useRef(0);

  // 文件分片处理
  const createFileChunks = (startByte: number, file: File) => {
    const chunks = [];
    let cur = startByte;
    while (cur < file.size) {
      chunks.push(file.slice(cur, cur + CHUNK_SIZE));
      cur += CHUNK_SIZE;
    }
    return chunks;
  };
  // 选择文件
  const handleFileChange = async (e: any) => {
    const selectedFile = e.target?.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      let startByte = await getUploadedSize(selectedFile.name);
      setProgress(((startByte / selectedFile.size) * 100).toFixed(2));
      uploadedSizeRef.current = startByte;
    }
  };

  // 获取已上传大小
  const getUploadedSize = async (filename: string) => {
    try {
      const response = await axios.head(
        `http://localhost:8080/upload/${filename}`,
      );
      return parseInt(response.headers['content-length']) || 0;
    } catch {
      return 0;
    }
  };

  // 上传文件
  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    controllerRef.current = new AbortController();

    const filename = encodeURIComponent(file.name);
    let startByte = await getUploadedSize(filename);
    uploadedSizeRef.current = startByte;

    const chunks = createFileChunks(startByte, file);

    for (const chunk of chunks) {
      const contentRange = `bytes ${startByte}-${startByte + chunk.size - 1}/${file.size}`;
      try {
        await axios.put(`http://localhost:8080/upload/${filename}`, chunk, {
          headers: {
            'Content-Range': contentRange,
            'Content-Type': 'Uploadlication/octet-stream',
          },
          signal: controllerRef.current.signal,
        });
        startByte += chunk.size;
        uploadedSizeRef.current = startByte;
        setProgress(((startByte / file.size) * 100).toFixed(2));
      } catch (err) {
        if (axios.isCancel(err)) {
          console.log('Upload paused');
        } else {
          console.error('Upload failed:', err);
        }
        return;
      }
    }

    setUploading(false);
  };

  // 暂停上传
  const handlePause = () => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      setUploading(false);
    }
  };

  return (
    <div style={{ padding: 20 }}>
      <h1>文件断点续传Demo</h1>
      <input type="file" onChange={handleFileChange} />

      {file && (
        <div style={{ marginTop: 20 }}>
          <div>文件名: {file.name}</div>
          <div>文件大小: {(file.size / 1024 / 1024).toFixed(2)} MB</div>
          <div>上传进度: {progress}%</div>

          {!uploading ? (
            <button
              onClick={handleUpload}
              style={{ marginTop: 10, marginRight: 10 }}
            >
              开始上传
            </button>
          ) : (
            <button
              onClick={handlePause}
              style={{ marginTop: 10, marginRight: 10 }}
            >
              暂停
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default Upload;
