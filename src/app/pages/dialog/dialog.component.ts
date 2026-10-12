import { Component, Input } from "@angular/core";
import { NbDialogRef } from "@nebular/theme";

@Component({
  selector: "ngx-dialog",
  templateUrl: "./dialog.component.html",
  styleUrls: ["./dialog.component.scss"],
})
export class DialogComponent {
  @Input() title: string;
  @Input() body: {
    type: string;
    agency_responsible: string;
    description: string;
    location: string;
    requested_at: string;
    update: string;
    service_code: string;
    service_name: string;
    status: string;
    status_notes: string;
  };

  constructor(protected ref: NbDialogRef<DialogComponent>) {}

  dismiss() {
    this.ref.close();
  }
}
