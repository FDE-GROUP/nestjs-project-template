import type { ReadStream } from 'node:fs';
import * as path from 'node:path';
import type { ConfigService } from '@app/config/config.service';
import { v4 as uuidv4 } from 'uuid';
import type { FileUploadOptions, StorageProvider, UploadedFileResult } from './storage.interface';

/**
 * Shared plumbing for object-storage providers (S3-compatible, Ali OSS, Tencent COS).
 *
 * Centralises the parts that were byte-identical across the three adapters —
 * key generation, content-type defaulting, ETag normalisation, public-URL
 * fallback and result assembly — so each subclass only implements the
 * SDK-specific upload / delete / sign calls and its own default URL format.
 */
export abstract class BaseStorageProvider implements StorageProvider {
  protected readonly bucket: string;
  protected readonly baseUrl: string;

  constructor(protected readonly configService: ConfigService) {
    const storageConfig = this.configService.getStorageConfig();
    this.bucket = storageConfig.bucket;
    this.baseUrl = storageConfig.baseUrl || '';
  }

  abstract uploadFile(
    fileBuffer: Buffer,
    filename: string,
    options?: FileUploadOptions,
  ): Promise<UploadedFileResult>;

  abstract uploadFileFromStream(
    fileStream: ReadStream,
    filename: string,
    options?: FileUploadOptions,
  ): Promise<UploadedFileResult>;

  abstract deleteFile(key: string): Promise<boolean>;

  abstract getFileUrl(key: string, expiresIn?: number): Promise<string>;

  /** Provider-specific default public URL when no custom baseUrl is configured. */
  protected abstract getDefaultPublicUrl(key: string): string;

  protected resolveContentType(options: FileUploadOptions = {}): string {
    return options.contentType || 'application/octet-stream';
  }

  /** Strip the surrounding quotes cloud vendors wrap around ETag values. */
  protected normalizeEtag(etag?: string): string | undefined {
    return etag?.replace(/"/g, '');
  }

  protected buildResult(input: {
    key: string;
    filename: string;
    contentType: string;
    /** Use `-1` when the size is unknown (stream uploads). */
    size: number;
    etag?: string;
  }): UploadedFileResult {
    return {
      key: input.key,
      url: this.getPublicUrl(input.key),
      etag: input.etag,
      size: input.size,
      mimetype: input.contentType,
      originalname: input.filename,
    };
  }

  /** `YYYY/MM/DD/<uuid><ext>` — identical across every provider. */
  protected generateKey(filename: string): string {
    const ext = path.extname(filename);
    const uuid = uuidv4();
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}/${month}/${day}/${uuid}${ext}`;
  }

  private getPublicUrl(key: string): string {
    return this.baseUrl ? `${this.baseUrl}/${key}` : this.getDefaultPublicUrl(key);
  }
}
