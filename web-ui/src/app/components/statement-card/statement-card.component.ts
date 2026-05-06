import { OverlayModule } from '@angular/cdk/overlay';
import { CommonModule } from '@angular/common';
import { Component, Input, OnInit } from '@angular/core';
import { CustomTooltipDirective } from "../../directives/custom-tooltip/custom-tooltip.directive";

import { Statement } from "../../models/report.model";
import { getVoteTotals } from "../../utils/vote-utils";

@Component({
    selector: 'app-statement-card',
    imports: [
        CommonModule,
        CustomTooltipDirective,
        OverlayModule,
    ],
    templateUrl: './statement-card.component.html',
    styleUrl: './statement-card.component.scss'
})
export class StatementCardComponent implements OnInit {
  @Input() data?: Statement;
  @Input() truncate = false;
  @Input() type = "";
  isOverallAgree?: boolean;
  agreePercent?: number;
  disagreePercent?: number;
  passPercent?: number;
  agreeTotal = 0;
  disagreeTotal = 0;
  passTotal = 0;
  voteTotal = 0;
  topics = "";

  ngOnInit() {
    if(!this.data) return;
    this.isOverallAgree = this.data.agreeRate >= this.data.disagreeRate;
    this.agreePercent = Math.round(this.data.agreeRate * 100);
    this.disagreePercent = Math.round(this.data.disagreeRate * 100);
    this.passPercent = Math.round(this.data.passRate * 100);
    const voteTotals = getVoteTotals(this.data.votes);
    this.agreeTotal = voteTotals.agreeCount;
    this.disagreeTotal = voteTotals.disagreeCount;
    this.passTotal = voteTotals.passCount;
    this.voteTotal = voteTotals.total;
    if(this.data.topics) {
      this.topics = this.data.topics.replaceAll(";", ", ").replaceAll(":", " > ");
    }
  }
}
