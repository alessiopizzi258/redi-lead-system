import { randomInt } from "crypto";

export interface ValidationResult {
  isValid: boolean;
  isTimeout: boolean;
  error?: string;
}

export class ValidationService {
  /**
   * LIVELLO 1: Validazione Tecnica Hard (Mock per API esterne)
   * Integrare qui chiamate reali a Hunter.io, ZeroBounce o NumVerify.
   */
  public static async verifyEmailTechnical(email: string): Promise<ValidationResult> {
    try {
      // Simulazione chiamata API esterna con timeout
      if (!email.includes("@") || email.includes("test.com")) {
        return { isValid: false, isTimeout: false, error: "Dominio email non valido o usa-e-getta." };
      }
      return { isValid: true, isTimeout: false };
    } catch (error) {
      // Cattura il timeout per attivare la coda DA_VERIFICARE_MANUALMENTE
      return { isValid: false, isTimeout: true, error: "Timeout API Email" };
    }
  }

  public static async verifyPhoneTechnical(phone: string): Promise<ValidationResult> {
    try {
      if (phone.length < 9) {
        return { isValid: false, isTimeout: false, error: "Formato telefono non valido." };
      }
      return { isValid: true, isTimeout: false };
    } catch (error) {
      return { isValid: false, isTimeout: true, error: "Timeout API Telefono" };
    }
  }

  /**
   * LIVELLO 3: Scoring di Coerenza
   * Disinnesca i perditempo identificando discrepanze logiche nei dati.
   */
  public static calculateCoherence(budget?: number, industry?: string, expectedIndustry?: string): number {
    let score = 0;
    
    // Esempio logica di coerenza: Budget alto ma settore fuori target
    if (budget && budget > 10000) score += 20;
    if (!budget) score -= 10;
    
    if (industry && expectedIndustry && industry.toLowerCase() !== expectedIndustry.toLowerCase()) {
      score -= 20; // Flag ANOMALO
    } else if (industry) {
      score += 15;
    }

    return score;
  }

  /**
   * LIVELLO 2: Generazione OTP
   */
  public static generateNumericOTP(length: number = 6): string {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return randomInt(min, max).toString();
  }
}