Template.history.helpers({
  movements: function () {
    if (Session.get('current-tab') != 'movements') return [];

    var and = []
    var exclude = Session.get("movement-filter-type") || []
    if (exclude.length > 0) {
      console.log("Movements: exclude type:", exclude)
      and.push({ _id: { $not: { $regex: "^(" + exclude.join("|") + ")" } } })
    }

    var exclude = Session.get("movement-filter-amount") || []
    if (exclude.length > 0) {
      console.log("Movements: exclude amount:", exclude)
      if (_.contains(exclude, "+")) and.push({ amount: { $lt: 0 }})
      if (_.contains(exclude, "-")) and.push({ amount: { $gt: 0 }})
    }

    var query = and.length > 0 ? { $and: and } : {}
    return Movements.find(query, { sort: { date: 1 } }).map(function(m){
      if (movementIsPayment(m)) {
        // FIXME: All the following fetching is probably inefficient. Denormalize or collect+update later.
        m.payment = Payments.findOne(m._id);
        if (m.payment && m.payment.hasOwnProperty('member')) {
          m.payment.memberInfo = Members.findOne(String(m.payment.member));
        }
      }
      return m;
    });
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
  humanAmount: function() { return Util.renderAmount(this.amount) },
  currency: function() {
    if (this.currency === undefined) return "€";
    else return ({ "GBP" : "£", "USD" : "$", "EUR" : "€"}[this.currency]) || this.currency;
  },
  combinedDescription: function() {
    if (this.source == "PP") {
      var parts = [];
      if (this.amount > 0) { parts.push(this.name); parts.push("<" + this.email + ">") }
      if (this.subject) parts.push(this.subject);
      if (this.note) parts.push(this.note);
      if (this.title) parts.push(this.title);
      return _.uniq(parts).join(" ");
    } else if (this.source == "CA") return this.description;
    else if (this.source == "BK") return this.note;
    else return "";
  },
  proposedMembers: function() {
    return (this.member === undefined) ? [{addNew: true}] : []
  },
  alias: function() { return movementAlias(this) },
  proposedUser: function() {
    var alias = Aliases.findOne(movementAlias(this));
    if (alias) return member = Members.findOne(alias.user);
  },
  type: function() {
    if (this.source == "PP") return payPalTypeMap[this.type] || this.type;
    return (this.source == "CA") ? "Payment" : this.type;
  },
  isPayment: function() { return movementIsPayment(this) },
  color: function() {
    return Session.get('current-payment') == this._id ? "active" :
           (this.amount >= 0 ? "positive" : "negative")
  },
  isCash: function() { return this.source == "CA" }
});

Template.paymentDetails.helpers({
  isPeriodEditable: function (noPeriodEdit) {
    // Cash movements can only be edited via the spreadsheet
    return !noPeriodEdit && this && this.source != "CA" ? "period-area" : ""
  },
  isTypeEditable: function (noTypeEdit) {
    // Cash movements can only be edited via the spreadsheet
    return !noTypeEdit && this && this.source != "CA"
  },
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
    Session.set('current-period', id);
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
  'click .ui.button.pick-member': function (event) {
    var payment = $(event.currentTarget).parents('tr').attr('data-id');
    Session.set('current-payment', payment)
    $("#sidebar").sidebar('show');
  },
  'click .ui.icon.remove-member': function (event) {
    var movement = $(event.currentTarget).parents('tr');
    Meteor.call('paymentMemberRemove', movement.attr('data-id'));
  },
  'click .ui.label.set-member': function (event) {
    var movement = $(event.currentTarget).parents('tr').attr('data-id');
    var member = $(event.currentTarget).attr('data-member');
    Meteor.call('paymentMemberSet', movement, member);
  },
  'click .ui.button.cycle-reason': function (event) {
    var movement = $(event.currentTarget).parents('tr');
    var id = movement.attr('data-id');
    Meteor.call('paymentCycleReason', id);
  }
});

Template.paymentDetails.events({
  'click .ui.buttons.period-selector .ui.button': function (event) {
    $(event.currentTarget).toggleClass('basic');
  }
});

function updateMovementTypeFilters() {
  var exclude = [];
  $(".ui.checkbox.filter-type").each(function() {
    if (!$(this).checkbox("is checked")) exclude.push($(this).attr("data-filter"))
  });
  Session.set("movement-filter-type", exclude)
}

function updateMovementAmountFilters() {
  var exclude = [];
  $(".ui.checkbox.filter-amount").each(function() {
    if (!$(this).checkbox("is checked")) exclude.push($(this).attr("data-filter"))
  });
  Session.set("movement-filter-amount", exclude)
}

Template.history.rendered = function() {
  $(".ui.checkbox.filter-type").checkbox("setting", {
    onChange: updateMovementTypeFilters
  })
  $(".ui.checkbox.filter-amount").checkbox("setting", {
    onChange: updateMovementAmountFilters
  })
}