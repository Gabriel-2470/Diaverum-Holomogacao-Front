import { Injectable } from '@angular/core';

export interface PacienteLinha {
  nome: string;
  cpf: string;
  genero: string;
  dataNascimento: string;
  tipoTratamento: string;
  diabetes: boolean;
  peso: number;
  altura: number;
}

@Injectable({
  providedIn: 'root',
})
export class ArquivoParserService {
  /**
   * Parse de arquivo CSV
   */
  parseCSV(conteudo: string): PacienteLinha[] {
    const linhas = conteudo.split('\n').filter((linha) => linha.trim());
    if (linhas.length < 2) {
      throw new Error('Arquivo CSV vazio ou inválido');
    }

    // Primeira linha é o header
    const headers = this.parseCSVLine(linhas[0]);
    const pacientes: PacienteLinha[] = [];

    for (let i = 1; i < linhas.length; i++) {
      const valores = this.parseCSVLine(linhas[i]);
      const paciente = this.mapearPaciente(headers, valores);
      if (paciente) {
        pacientes.push(paciente);
      }
    }

    return pacientes;
  }

  /**
   * Parse de uma linha CSV (considerando aspas)
   */
  private parseCSVLine(linha: string): string[] {
    const resultado: string[] = [];
    let atual = '';
    let dentro = false;

    for (let i = 0; i < linha.length; i++) {
      const char = linha[i];

      if (char === '"') {
        dentro = !dentro;
      } else if (char === ',' && !dentro) {
        resultado.push(atual.trim().replace(/^"|"$/g, ''));
        atual = '';
      } else {
        atual += char;
      }
    }

    resultado.push(atual.trim().replace(/^"|"$/g, ''));
    return resultado;
  }

  /**
   * Mapeia linha do arquivo para interface Paciente
   */
  private mapearPaciente(headers: string[], valores: string[]): PacienteLinha | null {
    try {
      const mapa: { [key: string]: string } = {};

      headers.forEach((header, index) => {
        mapa[header.toLowerCase().trim()] = valores[index] || '';
      });

      return {
        nome: mapa['nome'] || mapa['paciente'] || '',
        cpf: mapa['cpf'] || '',
        genero: mapa['genero'] || mapa['sexo'] || '',
        dataNascimento: mapa['data_nascimento'] || mapa['data nascimento'] || '',
        tipoTratamento: mapa['tipo_tratamento'] || mapa['tratamento'] || '',
        diabetes: this.converterBooleano(mapa['diabetes'] || 'não'),
        peso: parseFloat(mapa['peso'] || '0') || 0,
        altura: parseFloat(mapa['altura'] || '0') || 0,
      };
    } catch (erro) {
      return null;
    }
  }

  /**
   * Converte strings booleanas para boolean
   */
  private converterBooleano(valor: string): boolean {
    const baixa = valor.toLowerCase().trim();
    return ['sim', 'true', '1', 'yes', 's'].includes(baixa);
  }

  /**
   * Valida dados do paciente
   */
  validarPaciente(paciente: PacienteLinha): { valido: boolean; erros: string[] } {
    const erros: string[] = [];

    if (!paciente.nome || paciente.nome.trim().length < 3) {
      erros.push('Nome inválido ou muito curto');
    }

    if (!this.validarCPF(paciente.cpf)) {
      erros.push('CPF inválido');
    }

    if (!paciente.tipoTratamento) {
      erros.push('Tipo de tratamento obrigatório');
    }

    if (paciente.peso <= 0 || paciente.peso > 300) {
      erros.push('Peso fora do intervalo válido');
    }

    if (paciente.altura <= 0 || paciente.altura > 3) {
      erros.push('Altura fora do intervalo válido');
    }

    return {
      valido: erros.length === 0,
      erros,
    };
  }

  /**
   * Valida CPF (simples)
   */
  private validarCPF(cpf: string): boolean {
    // Remove caracteres especiais
    const cpfLimpo = cpf.replace(/\D/g, '');

    // Deve ter 11 dígitos
    if (cpfLimpo.length !== 11) {
      return false;
    }

    // Não pode ser sequência repetida
    if (/^(\d)\1{10}$/.test(cpfLimpo)) {
      return false;
    }

    return true;
  }

  /**
   * Lê arquivo como texto
   */
  lerArquivoTexto(arquivo: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const conteudo = e.target?.result;
        if (typeof conteudo === 'string') {
          resolve(conteudo);
        } else {
          reject(new Error('Erro ao ler arquivo'));
        }
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
      reader.readAsText(arquivo);
    });
  }
}
