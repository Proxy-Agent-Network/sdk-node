import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

/**
 * TPM 2.0 Hardware Bridge
 * Connects the Node.js runtime to the Infineon OPTIGA™ TPM via system drivers.
 * * Benefits:
 * - Enables "Tier 2" Identity tasks (Hardware Signed Proofs).
 * - Prevents key exfiltration (Private Key locked in silicon).
 */
export class TPMBridge {
  private tpmDevicePath: string;
  private keyHandle: string;

  constructor(devicePath: string = '/dev/tpm0', keyHandle: string = '0x81010001') {
    this.tpmDevicePath = devicePath;
    this.keyHandle = keyHandle; // Default persistent handle for Node Identity
  }

  /**
   * Verifies the hardware root of trust is accessible.
   */
  public async isAvailable(): Promise<boolean> {
    if (!fs.existsSync(this.tpmDevicePath)) {
      return false;
    }
    try {
      // Check TPM capabilities to ensure driver is responsive
      await execAsync('tpm2_getcap properties-fixed');
      return true;
    } catch (error) {
      console.warn('[TPM] Hardware check failed:', error);
      return false;
    }
  }

  /**
   * Cryptographically signs a payload using the sealed Identity Key.
   * The private key never leaves the TPM hardware.
   *
   * @param data - The raw buffer to sign (e.g. file hash)
   * @returns Signature as a hex string
   */
  public async sign(data: Buffer): Promise<string> {
    const isAvailable = await this.isAvailable();
    if (!isAvailable) {
      // In dev mode, we might fallback or throw based on config
      if (process.env.PROXY_ENV === 'development') {
        console.warn('[TPM] Mocking signature in DEV mode');
        return 'mock_hardware_signature_deadbeef';
      }
      throw new Error("PX_400: TPM Hardware not detected or inaccessible.");
    }

    // 1. Write data to temp file for TPM ingestion
    // (tpm2_tools expects file inputs for non-trivial data)
    const tmpInput = `/tmp/tpm_sign_in_${Date.now()}.bin`;
    const tmpOutput = `/tmp/tpm_sign_out_${Date.now()}.sig`;
    
    try {
      fs.writeFileSync(tmpInput, data);

      // 2. Invoke Hardware Signing
      // -c: Context/Handle of the key
      // -g: Hash algorithm (sha256)
      // -o: Output file
      await execAsync(`tpm2_sign -c ${this.keyHandle} -g sha256 -o ${tmpOutput} ${tmpInput}`);

      // 3. Read Signature
      const signature = fs.readFileSync(tmpOutput);
      return signature.toString('hex');

    } catch (error: any) {
      throw new Error(`TPM Signing Failed: ${error.message}`);
    } finally {
      // 4. Secure Cleanup
      if (fs.existsSync(tmpInput)) fs.unlinkSync(tmpInput);
      if (fs.existsSync(tmpOutput)) fs.unlinkSync(tmpOutput);
    }
  }

  /**
   * Generates a remote attestation quote to prove the software stack
   * hasn't been tampered with since boot.
   */
  public async getAttestationQuote(nonce: string): Promise<object> {
    // Implementation stub for v1.1
    // Runs tpm2_quote against PCR banks 0, 1, and 7
    return {
      pcr_bank: 'sha256',
      quote_signature: 'placeholder_attestation_sig',
      nonce: nonce
    };
  }
}
