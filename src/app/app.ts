import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet], // Remova o HeaderComponent daqui
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class AppComponent {
  title = 'sistema-exames';
}
