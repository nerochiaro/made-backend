var fs = Npm.require('fs');

var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function humanDate(date) {
  var d = String(date);
  var p = [monthNames[parseInt(d.substring(4, 6),10) - 1], d.substring(6)];
  p.unshift("<small>" + d.substring(0, 4) + "</small>");
  return p.join("&nbsp;")
}
function humanAmount(dec) { return String(dec).slice(0, -2) + "." + String(dec).slice(-2) }

var bankDescriptionToType = {
  "TRANSF CTE DE:" : "In",
  "TRASPAS A COMPTE DE:" : "In",
  "TRANSFERENCIA A:" : "Out",
  "R/ " : "Out",
  "XEC BANCARI " : "Out",
  "COMISSIÓ" : "Fee",
  "COMISSIO" : "Fee",
  "COM." : "Fee",
  "INGRES EFECTIU" : "Cash",
  "PAYPAL BALANCE": "Balance"
}
function parseBankDescription(d) {
  if (d) {
    var replaced = false;
    for (var key in bankDescriptionToType) {
      if (d.indexOf(key) == 0)
        return { type: bankDescriptionToType[key], note: d.substring(key.length) };
    }
  }
  return { type: "", note: d };
}

function cleanPaypalType(type) {
    return type.replace(' Received', '').replace('Recurring Payment', 'Recurring')
               .replace('Currency ', '').replace('Mobile ', '')
               .replace('Temporary ', '').replace('Update to ', '')
               .replace('Withdraw Funds to Bank Account', 'Withdraw')
               .replace(/\s/g, "&nbsp;");
}

var movTemplate =
  '  <tr class="%classes%" movementId="%id%">\n' +
  '    <td class="movId" title="%id%">%id%</td>\n' +  // id
  '    <td class="num">%date%</td>\n' +  // date
  '    <td class="num">%amount%</td>\n' +  // amount
  '    <td class="small">%type%</td>\n' +  // type
  '    <td class="small invoiceType">%invoiceType%</td>\n' +  // Invoice type
  '    <td class="small months" %monthsAttr%><span class="text-months">%months%</span></td>\n' + // months
  '    <td class="fullsize" colspan="2">%description% <small>%member%</small></td>\n' +  // descr
  '  </tr>';
var paypalMovTemplate =
  '  <tr class="%classes%" movementId="%id%" parent="%parent%">\n' +
  '    <td class="movId" title="%id%">%id%</td>\n' + //id
  '    <td class="num" title="%time%">%date%</td>\n' +  // date (title: time)
  '    <td class="num" title="%amountSplit%">%amount%</td>\n' +  // amounts (title: split)
  '    <td class="desc">%type%</td>\n' +  // type
  '    <td class="desc invoiceType">%invoiceType%</td>\n' +  // Invoice type
  '    <td class="desc months" %monthsAttr%><span class="text-months">%months%</span></td>\n' +  // months
  '    <td title="%email%">%name%&nbsp;<small>%member%</small></td>\n' +  // name (title: email)
  '    <td class="desc fullsize">%note%</td>\n' +  // descr + note
  '  </tr>';
var cashTemplate =
  '  <tr class="%classes%" movementId="%id%" parent="%parent%">\n' +
  '    <td class="movId" title="%id%">%id%</td>\n' + //id
  '    <td class="num">%date%</td>\n' + // date
  '    <td class="num">%amount%</td>\n' + // amount
  '    <td class="small">%type%</td>\n' + // type
  '    <td class="small">%invoiceType%</td>\n' + // Invoice type (not editable, edit in the spreadsheet)
  '    <td class="small months">%months%</td>\n' + // months
  '    <td class="fullsize" colspan="2">%note%&nbsp;<small>%member%</small></td>\n' + // name
  '  </tr>';

var monthTemplate = '<li><input type="checkbox" value="%y%-%m%" id="m_%y%%m%"/><label for="m_%y%%m%">%name%</label></li>'
function createYearbox() {
  return [2013, 2014].map(function(y) {
    return "<ul><li>%year%</li>%months%</ul>".format({
      year: y,
      months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(function(m) {
                return monthTemplate.format({ y: y, m: String(m+1).pad(2), name: monthNames[m] })
              }).join("")
    })
  }).join("")
}

function printMonths(months) {
  return months.reduce(function(state, month) {
    var year = parseInt(month.substring(0, 4), 10);
    month = monthNames[parseInt(month.substring(4, 6), 10) - 1];
    if (state.lastYear != year) state.text += "%0%:&nbsp;%1%".format(year, month);
    else state.text += "," + month;
    state.lastYear = year;
    return state;
  }, { text: "", lastYear: 0 }).text;
}

function printMember(member) {
  return "%0%:&nbsp;%1%&nbsp;%2%".format(member.fiscalId.replace("-", "").toUpperCase(), member.first, member.last);
}

function printMovements(movements, invoicesCallback) {
  function printPaypalMovement(pp) {
    var months = pp.amount.gross > 0 && pp.invoice ? pp.invoice.months : [];
    var member = (pp.member) ? printMember(pp.member) : "";
    return paypalMovTemplate.format({
      classes: pp.amount.net > 0 ? "invoice" : "",
      id: pp.id,
      date: humanDate(pp.date),
      time: pp.time.slice(0, -3),
      amountSplit: (pp.amount.fee != 0) ? "gross: %0% fee: %1%".format(humanAmount(pp.amount.gross), humanAmount(pp.amount.fee)) : "",
      amount: ((pp.currency != "EUR") ? "<small>%0%</small>&nbsp;%1%".format(pp.currency, pp.amount.gross > 0 ? "&nbsp;" : "") : "") + humanAmount(pp.amount.gross),
      type: cleanPaypalType(pp.type),
      invoiceType: pp.invoice ? pp.invoice.type : "",
      months: printMonths(months),
      monthsAttr: (months.length > 0) ? "months='%0%'".format(months.join(",")) : "",
      email: pp.email,
      name: pp.name.replace(/\s/g, "&nbsp;"),
      note: [pp.description.trim(), (pp.note.trim()) ? '"%0%"'.format(pp.note) : ""].join(" ").trim(),
      parent: pp.parent,
      member: member
    });
  }
  function printCashMovement(c) {
    var member = (c.members) ? c.members.map(function(m) { return printMember(m) }).join(", ") : "";
    return cashTemplate.format({
      classes: "",
      id: c.id,
      date: humanDate(c.date),
      amount: humanAmount(c.amount),
      type: "Cash in",
      invoiceType: c.type,
      months: c.months.join(","), monthsAttr: "",
      note: c.description,
      parent: c.parent,
      member: member
    });
  }
  function printBankMovement(m) {
      var classes = [];
      if (m.children) classes.push("expandable");
      else if (m.amount > 0) classes.push("invoice");
      classes.push(m.amount > 0 ? "in" : "out");

      var parsed = parseBankDescription(m.description);
      var months = m.amount > 0 && m.invoice ? m.invoice.months : [];
      var member = (m.members) ? m.members.map(function(m) { return printMember(m) }).join(",&nbsp;") : "";

      return movTemplate.format({
        classes: classes.join(" "),
        id: m.id,
        date: humanDate(m.dateTransaction, true),
        amount: humanAmount(m.amount),
        type: parsed.type,
        invoiceType: m.invoice ? m.invoice.type : "",
        months: printMonths(months),
        monthsAttr: (months.length > 0) ? "months='%0%'".format(months.join(",")) : "",
        description: parsed.note,
        member: member
      })
  }

  var template = String(fs.readFileSync("html/main.htm"));

  var lastBalancedPayPal = -1;
  var rows = [];
  var invoiced = [];
  function pushInvoice(m) {
    var type;
    if (m.id.substring(0, 2) == "CA") type = m.type;
    else type = m.invoice ? m.invoice.type : null;

    function flattenNames(members) { return members.map(function(m) { return m.first + " " + m.last }).join(", ") };
    function flattenIds(members) { return members.length == 1 ? members[0].fiscalId : members.map(function(m) { return m.first + " " + m.last + " : " + m.fiscalId }).join(", ") };
    function translateMonths(months) { return months.map(function(m) { return "2014" + String(monthNames.indexOf(m) + 1).pad(2) }) }
    if (type) {
      invoiced.push({
        id: m.id,
        date: m.dateTransaction ? m.dateTransaction : m.date,
        type: type,
        months: m.months ? translateMonths(m.months) : m.invoice.months,
        amount: m.amount.gross ? m.amount.gross : m.amount,
        name: (m.member) ? m.member.first + " " + m.member.last : (m.members ? flattenNames(m.members) : (m.name || m.description)),
        NIF: (m.member) ? m.member.fiscalId : (m.members ? flattenIds(m.members) : ""),
        description: "%0% - %1%".format(m.name, m.description)
      })
    }
  }

  movements.bank.forEach(function(m) {
    // output BANK block
    rows.push(printBankMovement(m));
    pushInvoice(m);

    if (m.children) {
      if (m.children.cash) {
        movements.cash.slice(m.children.cash.from, m.children.cash.to + 1).forEach(function(c) {
          rows.push(printCashMovement(c));
          pushInvoice(c);
        });
      } else if (m.children.paypal) {
        lastBalancedPayPal = m.children.paypal.to + 1;
        movements.paypal.slice(m.children.paypal.from, m.children.paypal.to + 1).forEach(function(pp) {
          rows.push(printPaypalMovement(pp));
          pushInvoice(pp);
        });
      }
    }
  });

  if (lastBalancedPayPal != -1) {
    var paypalBalance = movements.paypal.slice(lastBalancedPayPal + 1);

    rows.push(printBankMovement({
      children: [],
      id: "VTPAYPALBALANCE",
      dateTransaction: paypalBalance[paypalBalance.length - 1].date,
      amount: paypalBalance.reduce(function(val, m) { return val + m.amount.net }, 0),
      invoiceType: "",
      months: "MONTHS",
      description: "PAYPAL BALANCE Current Paypal Balance"
    }));

    movements.paypal.slice(lastBalancedPayPal + 1).forEach(function(m) {
      m.parent = "VTPAYPALBALANCE";
      rows.push(printPaypalMovement(m));
      pushInvoice(m);
    });
  }

  invoicesCallback(invoiced);

  return template.format({
    movements: rows.join("\n"),
    yearbox: createYearbox()
  });
}
