import { Component, ViewChild, ElementRef } from '@angular/core';
import { AuthService } from '../../services/auth-service.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent {
  @ViewChild('gallery', { static: false }) gallery!: ElementRef<HTMLDivElement>;

  constructor(private authService: AuthService) {}

  isLoggedIn(): boolean {
    return !!this.authService.getToken();
  }

  scrollNext(): void {
    const el = this.gallery?.nativeElement;
    if (el) {
      el.scrollBy({ left: el.clientWidth, behavior: 'smooth' });
    }
  }

  scrollPrev(): void {
    const el = this.gallery?.nativeElement;
    if (el) {
      el.scrollBy({ left: -el.clientWidth, behavior: 'smooth' });
    }
  }

  // Carousel state
  images = [
    'assets/images/GeoCacherHome1.png',
    'assets/images/GeoCacherHome2.png',
    'assets/images/GeoCacherHome3.png',
    'assets/images/GeoCacherHome4.png',
    'assets/images/GeoCacherHome5.png'
  ];
  captions = ['home_caption_1','home_caption_2','home_caption_3','home_caption_4','home_caption_5'];
  currentIndex = 0;

  onScroll(): void {
    const el = this.gallery?.nativeElement;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    this.currentIndex = Math.min(Math.max(idx, 0), this.images.length - 1);
  }

  goTo(index: number): void {
    const el = this.gallery?.nativeElement;
    if (!el) return;
    const left = index * el.clientWidth;
    el.scrollTo({ left, behavior: 'smooth' });
    this.currentIndex = index;
  }

  login(): void {
    this.authService.login();
  }
}