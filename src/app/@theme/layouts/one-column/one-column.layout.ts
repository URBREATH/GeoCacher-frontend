import { Component } from "@angular/core";

@Component({
  selector: "ngx-one-column-layout",
  styleUrls: ["./one-column.layout.scss"],
  template: `
    <nb-layout windowMode>
      <nb-layout-column>
        <ng-content></ng-content>
      </nb-layout-column>
      <nb-layout-footer class="footer">
        <div class="outer-box">
              <div class="eu-flag">
                <img src="assets/images/eu-flag.png" alt="EU Flag" class="flag-icon">
              </div>
          <div class="disclaimer-content">
            <div class="disclaimer-text">
              <p>
                This project is co-funded by the European Union under grant agreement ID 101139711. The information and views set out in this website are those of the URBREATH Consortium only and do not necessarily reflect those of the European Union. Neither the European Union nor the granting authority can be held responsible for them.
              </p>
            </div>
            <div class="separator"></div>
            <div class="footer-links">
              <div class="links-section">
                <a href="https://urbreath.eu/cookie-declaration/" class="footer-link">Cookie Declaration</a>
                <span class="divider">|</span>
                <a href="https://urbreath.eu/terms-of-use/" class="footer-link">Terms of Usage</a>
                <span class="divider">|</span>
                <a href="https://urbreath.eu/privacy-policy" class="footer-link">Privacy Policy</a>
              </div>
              <div class="social-section">
                <a href="https://www.linkedin.com/company/urbreath-horizon-europe-project" class="social-link"><nb-icon icon="linkedin-outline"></nb-icon></a>
                <a href="https://www.youtube.com/channel/UC2n4Kx-Joo_Rhx9KZTrU-bg" class="social-link"><nb-icon icon="video-outline"></nb-icon></a>
                <a href="https://x.com/URBREATHProject" class="social-link"><nb-icon icon="twitter-outline"></nb-icon></a>
                <a href="mailto:info@urbreath.eu" class="social-link"><nb-icon icon="email-outline"></nb-icon></a>
              </div>
              <div class="copyright">
                Copyrights © 2025 URBREATH. All Rights Reserved.
              </div>
            </div>
          </div>
        </div>
      </nb-layout-footer>
    </nb-layout>
  `,
})
export class OneColumnLayoutComponent {}
