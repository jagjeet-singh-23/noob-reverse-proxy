import { readFile } from "node:fs/promises";

type SSLConfig = {
  cert: Buffer;
  key: Buffer;
}

export class CertificateManager {
  private certificates: Map<string, SSLConfig> = new Map();

  async loadCertificate(certPath: string, keyPath: string): Promise<SSLConfig> {
    try {
      const certificate = await readFile(certPath);
      const key = await readFile(keyPath);
      console.log(`🔐 Loaded certificate from ${certPath} and key from ${keyPath}`);

      return { cert: certificate, key: key };
    } catch (error) {
      console.error(`❌ Failed to read SSL key from ${keyPath}: ${(error as Error).message}`);
      throw new Error(`Failed to read SSL key from ${keyPath}: ${(error as Error).message}`);
    }
  }

  async createSelfSignedCertificate(): Promise<SSLConfig> {
    const { exec } = require('child_process');
    const { promisify } = require('util');

    const execAsync = promisify(exec);

    try {
      await execAsync(`
        openssl req -x509 -newkey rsa:4096 -keyout /tmp/key.pem -out /tmp/cert.pem \
        -days 365 -nodes -subj "/CN=localhost"
      `);

      return await this.loadCertificate('/tmp/cert.pem', '/tmp/key.pem');
    } catch (error) {
      console.error(`❌ Failed to generate self-signed certificate: ${(error as Error).message}`);
      throw error;
    }
  }

  getDefaultSSLOptions(): any {
    return {
      // Modern TLS configuration
      secureProtocol: 'TLS_method',
      secureOptions: require('constants').SSL_OP_NO_SSLv2 | require('constants').SSL_OP_NO_SSLv3,
      ciphers: [
        'ECDHE-RSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES128-SHA256',
        'ECDHE-RSA-AES256-SHA384'
      ].join(':'),
      honorCipherOrder: true
    };
  }
}
