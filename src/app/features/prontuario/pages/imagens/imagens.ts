// Aba "Imagens" (NephroSys pag.15): estrutura de visualização de imagens.
// A origem ainda não envia imagens; quando enviar, os documentos com mimeType
// image/* aparecerão aqui (via listarDocumentos filtrado). V1 somente leitura.

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'pr-imagens',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './imagens.html',
  styleUrl: './imagens.scss',
})
export class Imagens {}
