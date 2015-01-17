selectedMovement = null;

Template.history.helpers({
  movements: function () {
    return Movements.find({}, { sort: { date: 1 } });
  }
});

function movementAlias(movement) {
  if (movement.source == "PP") return movement.email
  else if (movement.source == "CA") return movement.description;
  else if (movement.source == "BK") return movement.note;
}

function movementIsPayment(movement) { 
  return (movement.amount > 0 &&
    (movement.source == "CA") ||
    (movement.source == "BK" && movement.type == "Payment") ||
    (movement.source == "PP" && payPalPaymentTypes.indexOf(movement.type) != -1));
}

var payPalTypeMap = {
  "Payment Received" : "Payment",
  "Recurring Payment Received" : "Payment (Recurring)",
  "Donation Received" : "Payment (Donation}",
  "Mobile Payment Received" : "Payment (Mobile)",
  "Withdraw Funds to Bank Account" : "Withdrawal"
};
var payPalPaymentTypes = ["Payment Received", "Recurring Payment Received", "Donation Received", "Mobile Payment Received"];
var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function splitYYYYMM(yyyymm) { return {
  year: parseInt(yyyymm.substring(0, 4), 10),
  month: parseInt(yyyymm.substring(4), 10)
}}
    
Template.movement.helpers({
  humanDate: function() {
    var d = String(this.date);
    var p = [monthNames[parseInt(d.substring(4, 6),10) - 1], d.substring(6)];
    p.unshift("<small>" + d.substring(0, 4) + "</small>");
    return Spacebars.SafeString(p.join("&nbsp;"));
  },
  humanAmount: function() { 
    return String(this.amount).slice(0, -2) + "." + String(this.amount).slice(-2) 
  },
  isIncome: function() { return this.amount >= 0 },
  currency: function() { 
    if (this.currency === undefined) return "€";
    else return ({ "GBP" : "£", "USD" : "$", "EUR" : "€"}[this.currency]) || this.currency;
  },
  combinedDescription: function() {
    if (this.source == "PP") {
      var parts = [];
      if (this.amount > 0) { parts.push(this.name); parts.push("<" + this.email + ">") }
      if (this.note) { parts.push(this.note) }
      return parts.join(" ");  
    } else if (this.source == "CA") return this.description;
    else if (this.source == "BK") return this.note;
    else return "";      
  },
  proposedMembers: function() {
    return (this.member === undefined) ? [{addNew: true}] : []
  },
  alias: function() { return movementAlias(this) },
  member: function() {
    if (this.member) return this.member;
    var alias = Aliases.findOne(movementAlias(this));
    if (alias) {
      var member = Members.findOne(alias.user);
      if (member) {
        member.isAlias = true;
        return member;
      }
    }
    return null;
  },
  type: function() {
    if (this.source == "PP") return payPalTypeMap[this.type] || this.type;
    return (this.source == "CA") ? "Payment" : this.type;
  },
  isPayment: function() { return movementIsPayment(this) },
  payment: function() {
    var payment = Payments.findOne(this._id);
    if (payment) { 
      payment.source = this.source;
      if (this.source == "CA") payment.type = this.type;
      return payment; 
    }
    return null;  
  }
});

Template.paymentDetails.helpers({
  isEditable: function () { return this && this.source != "CA" },
  period: function() {
    return this.months ? this.months.map(function(m) {
      return monthNames[splitYYYYMM(m).month - 1];
    }) : "";
  },
  editingPeriod: function() { return this._id && this._id == Session.get('current-period') }
});

Template.paymentDetails.events({
  'click td.period-area': function (event) {
    var id = $(event.currentTarget).parents('tr').attr('data-id');
    // Cash movements are not editable. Use the spreadsheet.
    if (id.substring(0, 2) != 'CA') Session.set('current-period', id);
  }
});

function monthInList(list, year, month) {
  return list ? list.some(function(m) { 
    var d = splitYYYYMM(m);
    return d.year == year && d.month == month;
  }) : false;
}

// Template is called with movement as argument, so this == movement in the helpers
Template.periodEditor.helpers({
  'calendar': function() {
    var selectedMonths = this.months;
    var cal = [];
    for (var y = 2013; y <= 2015; y++) { //FIXME: make years more dynamic
      cal.push({year: y, months: monthNames.map(function(m, i) {
        return { 
          name: m, 
          number: i, 
          color: monthInList(selectedMonths, y, i + 1) ? 'orange' : '' 
        };
      })});
    }
    return cal;
  }
})

Template.periodEditor.events({
  'click .ui.label.close-editor': function (event) { 
    Session.set('current-period', '-none-');   
    event.stopPropagation();
  },
  'click .ui.button.toggle-month': function(event) {
    var month = $(event.currentTarget).attr('data-month');
    var movement = $(event.currentTarget).parents('tr');
    var id = movement.attr('data-id');   
    if (month) {
      var month = month.split('-');
      Meteor.call('paymentToggleMonth', id, month[0], month[1]);
    }
  }
})

Template.movement.events({
  'click .ui.button.choose-alias': function (event) {
    selectedMovement = $(event.currentTarget).parents('tr');
    selectedMovement.addClass('active');
    $("#sidebar").sidebar('show');
  },
  'click .ui.button.remove-alias': function (event) {
    var movement = $(event.currentTarget).parents('tr');
    Meteor.call('aliasRemove', movement.attr('data-alias'));
  },
  'click .ui.button.cycle-reason': function (event) {
    var movement = $(event.currentTarget).parents('tr');
    var id = movement.attr('data-id');   
    Meteor.call('paymentCycleReason', id);
  }
});

Template.paymentDetails.events({
  'click .ui.buttons.period-selector .ui.button': function (event) {
    console.log(event.currentTarget)
    $(event.currentTarget).toggleClass('basic');
  }
});