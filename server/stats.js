MADEStats = {};

// Read bank movements from Norma43 format file
// Specfication: https://empresas.bankinter.com/stf/plataformas/empresas/gestion/ficheros/formatos_fichero/norma_43_ingles.pdf
MADEStats.readBankFile = Async.wrap(function(filename, callback) {
  var bankDescriptionToType = {
    "TRANSF CTE DE:" : "Payment",
    "TRASPAS A COMPTE DE:" : "Payment",
    "TRANSFERENCIA A:" : "Out",
    "R/ " : "Out",
    "XEC BANCARI " : "Out",
    "ANUL.INGRES EFECTIU" : "Out",
    "COMISSIÓ" : "Fee",
    "COMISSIO" : "Fee",
    "DEBIT TITOL COOPERATIVA" : "Fee",
    "COM." : "Fee",
    "INGRES EFECTIU" : "Deposit",
    "PAYPAL BALANCE": "Balance"
  }
  var PAYPAL_DEPOSIT_DESCRIPTION = "PayPal Europe S.a";
  function parseBankDescription(description, movement) {
    movement.description = description;
    movement.type = "";
    movement.note = description;
    
    var replaced = false;
    for (var key in bankDescriptionToType)
      if (description.indexOf(key) == 0) {
        movement.type = bankDescriptionToType[key];
        movement.note = description.substring(key.length).trim();
        if (movement.note == PAYPAL_DEPOSIT_DESCRIPTION) movement.type = "Deposit";
      }
  }

  var fs = Npm.require('fs');
  fs.readFile(filename, "utf8", function(err, f) {
    if (err) { return console.log("Error opening file:", err); }
    var movements = [];
    f.split("\r\n").map(function(line) { return line.trim() }).forEach(function(line) {
      var type = parseInt(line.substr(0, 2), 10);
      switch (type) {
        case 22:
          var movement = {
            source: "BK",
            dateTransaction: parseInt("20" + line.substr(10, 6)),
            dateValue: parseInt("20" + line.substr(16, 6)),
            sharedCode: line.substr(22, 2),
            amount: parseInt(line.substr(28, 14)) * (parseInt(line.substr(27, 1)) == 1 ? -1 : +1),
            documentId: line.substr(42, 10),
            reference1: line.substr(52, 12),
            reference2: line.substr(64, 16),
          };
          movement._id = movement.source + [movement.documentId, movement.reference1, movement.sharedCode].join("-");
          movement.date = movement.dateTransaction; // convenience
          movements.push(movement);
          break;
        case 23:
          if (movements.length > 0) {
            parseBankDescription(line.substr(4, 38).trim(), movements[movements.length - 1]);
          }
          break;
      }
    });
    callback(null, movements);
  });
});

// Paypal movements are grouped by the date they were deposited into the bank account
// (or the fake date 99990101 to mean they are still in paypal)
MADEStats.readPaypalFile = Async.wrap(function(filename, callback) {
  function readPPfloat(s) { return parseInt(s.split(",")[0] + s.split(",")[1].substring(0, 2), 10) }

  // When a movement is approved but held for verification by PayPal we receive a line with "Payment Received" type
  // that has zero impact on the balance, but has the valid Note text. Then when the verification succeeds
  // we receive a line with type "Update to Payment Received" which impacts the balance but has no Note.
  // Since both have the right Amount, we discard the "Update" even though if we wanted to do things properly
  // we should copy the Note into the "Update" and discard the orginal non-balance-affecting Payment instead.
  var PAYPAL_DISCARD_ID = "Update to Payment Received";

  var movements = [];
  var i = 0;
  var source = "PP";
  Meteor.npmRequire("fast-csv").fromPath(filename)
  .on("data", function(data){
      var type = data[4];
      if (i++ == 0 || type == PAYPAL_DISCARD_ID) return;
      var amount = readPPfloat(data[8]);
      movements.push({
        source: source,
        date: parseInt(data[0].split("/").reverse().join('')),
        time: data[1],
        timeZone: data[2],
        name: data[3],
        type: type,
        description: data[6],
        currency: data[7],
        amounts: {
          gross: amount,
          fee: readPPfloat(data[9]),
          net: readPPfloat(data[10])
        },
        amount: amount, // convenience
        note: data[11],
        email: data[12],
        _id: source + data[14]
      });
  })
  .on("end", function(){
    movements.reverse();
    callback(null, movements);
  });
});

// Reads cash movements from sheet "Red Box" exported from master Google spreadsheet as CSV
// Columns: Id, Deposited, Expected, Date of Deposit, Amount, Type, Months, Description, Notes
MADEStats.readCashFile = Async.wrap(function(filename, callback) {
  function parseCashValue(v) { return v ? parseInt(v.replace(/[\.€\s]/g, ""), 10) : 0 }
  var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function pad(number, digits) {
    return Array(Math.max(digits - String(number).length + 1, 0)).join(0) + number;
  }
  function parseDateValue(d) { 
    d = d ? d.split("-").map(function(p, i) { return pad(i == 1 ? months.indexOf(p) + 1 : p, 2) }).reverse().join("") : "";
    d = parseInt(d, 10);
    return isNaN(d) ? 0 : d;
  }

  var movements = [];
  var i = 0;
  var source = "CA";
  Meteor.npmRequire("fast-csv").fromPath(filename)
  .on("data", function(data){
      // skip data at beginning of file until a valid id is found
      var id = parseInt(data[0], 10);
      if (isNaN(id)) {
        if (movements.length == 0) return;
        else console.log("Invalid row:", data);
      }
      if (parseInt(data[3], 10) == 0) return; // skip movements without deposit date for now

      var months = data[6] ? data[6].split(",") : [];
      var year = data[7];
      months = months.map(function(m) {
        if (m < this.lastmonth) { year++; lastmonth: m }
        return pad(year, 4) + pad(m, 2);
      }, { lastmonth: 0 });

      var movement = {
        source: source,
        _id: source + pad(id, 6),
        date: parseDateValue(data[3]),
        amount: parseCashValue(data[4]),
        type: data[5] || "",
        months: months,
        description: data[8].trim(),
        notes: (data[9]) ? data[9].trim() : ""
      };
      //if (movement.date && movement.amount > 0)
        movements.push(movement);
  })
  .on("end", function(){
    callback(null, movements);
  });
});

// Reads members from the master membership document in google docs.
// Columns: Timestamp,Name,Surname,Email,Phone,ID,Signup mode,,#,J,J,A,S,O,N,D,J,F,M,A,M,J,J,A,S,O,N,D
MADEStats.readMembersFile = Async.wrap(function(filename, callback) {
  var items = [];
  var i = 0;
  var endlist = false;
  Meteor.npmRequire("fast-csv").fromPath(filename)
  .on("data", function(data){
      // As soon as we hit a row with empty timstamp we are past the list of members
      // Anything past that is stats and other stuff we are not interested in
      if (data[0] == "") endlist = true;
      if (i++ == 0 || endlist) return;
      var id = data[8] ? parseInt(data[8].replace("#", ""), 10) : -1;
      if (id == -1) {
        console.log("Load members: discarding user due to missing id:", data[1], data[2], data[3]);
        return;
      }
      var item = {
        dateJoined: data[0],
        first: data[1],
        last: data[2],
        email: data[3],
        phone: data[4],
        fiscalId: data[5],
        _id: String(id),
        payments: data.slice(9),
      };
      item.clean = cleanAccents(item.first + " " + item.last);
      items.push(item);
  })
  .on("end", function(){
    callback(null, items);
  });
});

// Creates correlation tables matching bank movements with groups of other movements
// that were collected in PayPal or by cash and then deposited into the bank account.
MADEStats.correlateMovements = function(movements) {
  var PAYPAL_MOVEMENT_ID = "TRANSF CTE DE:PayPal Europe";
  var CASH_MOVEMENT_ID = "INGRES EFECTIU";
  var PAYPAL_WITHDRAWAL_ID = "Withdraw Funds to Bank Account";

  var invoices = movements.invoices || {};

  // Create index of parent transactions (the ones where money from cash or PP was
  // deposited in the bank).
  var parents = {
    paypal: [],
    cash: {}
  };
  movements.bank.forEach(function(m) {
    if (m.description.indexOf(PAYPAL_MOVEMENT_ID) == 0) parents.paypal.push(m);
    else if (m.description.indexOf(CASH_MOVEMENT_ID) == 0) parents.cash[m.dateTransaction] = m;
    else if (m.id == "BK0002502375-000000000000") parents.cash[m.dateTransaction] = m;
    else {
      var invoice = invoices[m.id];
      if (invoice) m.invoice = invoice;
    }
  });

  // For each cash parent there might not be any cash children (since we didn't record all
  // cash payments in the past), but if there is any then they will all have the same date
  // as the parent movement.
  movements.cash.forEach(function(cash, i) {
    if (cash.date && cash.amount) {
      var bank = parents.cash[cash.date];
      if (bank) {
        cash.parent = bank.id;
        if (!bank.hasOwnProperty("children")) bank.children = { cash: { from: i, to: i }};
        else bank.children.cash.to = i;
      }
    }
  })

  // For each paypal parent movement there must be a number of children paypal movements.
  // However the date the money arrives in the bank is a few days later than the PP
  // deposit movement. Therefore when we find a PP deposit ("Withdrawal" in PP terms) we
  // look up the nearest bank movement from PayPal and use it as the parent.
  var from = -1;
  var to = -1;
  movements.paypal.forEach(function(paypal, i) {
    if (paypal.type == PAYPAL_WITHDRAWAL_ID) {
      var bank = null;
      parents.paypal.some(function(b) {
        if (b.dateTransaction > paypal.date) { bank = b; return true }
        return false;
      });

      if (bank) {
        bank.children = { paypal: { from: from, to: to } };
        movements.paypal.slice(from, to + 1).forEach(function(p) { p.parent = bank.id });
      }
      from = -1;
    } else {
      if (from == -1) from = i;
      to = i;

      var invoice = invoices[paypal.id];
      if (invoice) paypal.invoice = invoice;
    }
  })
}

function cleanAccents(name) {
  return name.replace(/[éè]/, "e").replace(/[òó]/ig, "o").replace(/[àá]/ig, "a").replace(/[ìí]/ig, "i").replace(/[ùú]/gi, "u");
}

function correlateMembers(movements, members) {
  var indexes = members.reduce(function(index, m) {
    var name = cleanAccents(m.first.split(" ")[0]).toUpperCase();
    if (index.firstName[name]) index.firstName[name].push(m);
    else index.firstName[name] = [m];
    index.email[m.email] = m;
    return index;
  }, { firstName: {}, email: {}});

  movements.paypal.forEach(function(m) {
    var member = indexes.email[m.email];
    if (member) m.member = member;
    else {
      var name = cleanAccents(m.name.split(" ")[0]).toUpperCase();
      var members = indexes.firstName[name];
      if (members) m.members = members;
    }
  });

  movements.cash.forEach(function(m) {
    if (m.description) {
      var name = cleanAccents(m.description.split(" ")[0]).toUpperCase();
      var members = indexes.firstName[name];
      if (members) m.members = members;
    }
  });

  movements.bank.forEach(function(m) {
    if (m.description.indexOf("TRANSF CTE DE:") == 0 ||
        m.description.indexOf("TRASPAS A COMPTE DE:") == 0)
    {
      var name = cleanAccents(m.description.split(":")[1].trim().split(" ")[0]).toUpperCase();
      var members = indexes.firstName[name];
      if (members) m.members = members;
    }
  });
}

function loadInvoices(callback) {
  red.smembers('movements', function(err, movementIDs) {
    red.mget(movementIDs.map(function(id) { return 'movement:' + id + ':type'; }), function(err, types) {
      var invoices = movementIDs.reduce(function(map, id, i) {
        map[id] = { type: types[i] };
        return map;
      }, {});

      var multi = red.multi();
      movementIDs.forEach(function(id) { multi.smembers('movement:' + id + ':months') });
      multi.exec(function(err, replies) {
        movementIDs.forEach(function(id, i) { invoices[id].months = replies[i]; });

        callback(invoices);
      });
    });
  });
}

function writeInvoicesFile(filename, data) {
  require('fs').writeFile(filename, JSON.stringify(data));
}

function updateInvoice(movements, invoice) {
  var movType = invoice.id.substring(0, 2);
  var movs;
  if (movType == "PP") movs = movements.paypal;
  else if (movType == "BK") movs = movements.bank;
  else return; // cash movements can't be updated, use the spreadsheet

  red.sadd('movements', invoice.id);
  if (invoice.hasOwnProperty('type'))
    red.set('movement:' + invoice.id + ':type', invoice.type);
  if (invoice.hasOwnProperty('months')) {
    red.del('movement:' + invoice.id + ':months')
    invoice.months.forEach(function(months) { red.sadd('movement:' + invoice.id + ":months", months) });
  }

  movs.some(function(m) {
    if (m.id == invoice.id) { m.invoice = invoice; return true; }
  });
}

MADEStats.calculateGlobalStats = function(from, to, movements) {
  var totals = { income: {}, expense: {} }
  var names = {
    expense: {
      rent: ["Polyplicity S.L.", "POLYPLICITY, S.L.", "JOSEP MARIA TORRAS FERRE", "JOSEP M"],
      equipment: ["Laser Project"],
      utilities: ["CABLEUROPA, S.A.U."],
      bank: ["PRESENTACIÓ TRANSFERÈNCIES", "MANTENIMENT", "ANUAL TARGETA", "EMISSIÓ XEC BANCARI", "DEBIT TITOL COOPERATIVA"],
      insurance: ["REALE SEGUROS GENERALES, S.A."],
      accounting: ["Elena Bassols"],
      internetServices: ["Google Ireland Limited"]
    },
    income: {
      workshops: ["FUNDACIO PRIVADA", "FUNDACIO SONOS"],
      loans: ["BK0002389404-000000000000"]
    }
  }
  var ignored = ["BK0879413437-000000000000", "BK0879414519-000000000000"]
  
  movements.bank.forEach(function(m) {
    if (ignored.indexOf(m.id) != -1) return;
    if (from && m.dateTransaction < from) return;
    if (to && m.dateTransaction > to) return;

    var groupName = (m.amount > 0) ? "income" : "expense";
    var group = totals[groupName];
    var namegroup = names[groupName];
    var matched = false;
    
    for (type in namegroup) {
      var namesingroup = namegroup[type];
      namesingroup.some(function(name) {
	if (m.id == name ||
	    m.description.indexOf(name) != -1) {
	  group[type] = group[type] ? group[type] + Math.abs(m.amount) : Math.abs(m.amount)
	  matched = true;
	  return true;
	}
	return false;
      });
      if (matched) break;
    }
    if (!matched) {
      if (m.amount < 0) console.log(from, to, m.description, m.amount);
      var type = "others";
      group[type] = group[type] ? group[type] + Math.abs(m.amount) : Math.abs(m.amount);
    }
  });
    
  for (var group in totals) {
    var total = 0;
    for (var type in totals[group]) {
      totals[group][type] /= 100;
      console.log(from + ',' + to + ',"' + group + '","' + type + '",' + totals[group][type])
      total += totals[group][type];
    }
    totals[group]["total"] = total;
  }
 
  //console.log(totals);
  //console.log(totals.income.total - totals.expense.total);
}
