Movements = new Mongo.Collection("movements");
Members = new Mongo.Collection("members");
Aliases = new Mongo.Collection("aliases");
Payments = new Mongo.Collection("payments");

if (Meteor.isClient) {
  Meteor.subscribe('membersList')
  Meteor.subscribe('paymentsList')
  Meteor.subscribe('aliasesList')
  Meteor.subscribe('movementsList')
}

// On server startup, create some players if the database is empty.
if (Meteor.isServer) {
  //MADEStats.correlateMovements(movements);
  //MADEStats.calculateGlobalStats(20140101, 0, movements);

  Meteor.startup(function () {
    var base = "/home/nerochiaro/projects/made_backend/data/";
    var movements = {
      cash: MADEStats.readCashFile(base + "Cash.csv"),
      paypal: MADEStats.readPaypalFile(base + "Download.UTF8.csv"),
      bank: MADEStats.readBankFile(base + "MovimientosCuenta.UTF8.Q43")
    };
    var members = MADEStats.readMembersFile(base + "Members.csv");

    function insertRecords(list, collection) {
      duplicates = [];
      inserted = 0;
      called = 0;
      _.each(list, function(m) {
        called++
        if (collection.findOne(m._id)) duplicates.push(m._id);
        else collection.insert(m, function(err, id) {
          if (err) console.log("Failed to insert", id, ":", err)
          else inserted++;
        });
      });
      console.log(duplicates);
    };

    movements.paypal.map(function(m) {
      var match = Members.findOne({ email: m.email });
      if (match) m.member = { id: match._id, first: match.first, last: match.last };
      else console.log("no match for", m.email)
      return m;
    });

    Movements.remove({});
    Members.remove({});
    insertRecords(movements.cash, Movements);
    insertRecords(movements.paypal, Movements);
    insertRecords(movements.bank, Movements);
    insertRecords(members, Members);

    // FIXME: refactor this with the one in stats.js
    function cleanAccents(name) {
      return name.replace(/[éè]/, "e").replace(/[òó]/ig, "o").replace(/[àá]/ig, "a").replace(/[ìí]/ig, "i").replace(/[ùú]/gi, "u");
    }
    // Payment information for cash payments is strictly from the Cash.csv file and not editable
    // We reinsert it in Payments to simplify the application
    Payments.remove({_id: {$regex: /^CA.*/}})
    movements.cash.forEach(function(c) {
      var item = { months: c.months, type: c.type }
      if (c.description) {
        console.log(cleanAccents(c.description));
        var member = Members.findOne({clean: cleanAccents(c.description)});
        if (member) item.member = member._id;
      }
      Payments.upsert(c._id, {$set: item}, function(err, id) { if (err) console.log("cash months insert err:", err, id)})
    })

    //OneOff.importPayments(false);
  });

  var reasons = ["Membership", "Laser", "Member+Laser", "Donation", ""];
  function pad(number, digits) {
    return Array(Math.max(digits - String(number).length + 1, 0)).join(0) + number;
  }

  Meteor.methods({
    aliasAdd: function (user, alias) {
      console.log("calling add alias", user, alias);
      if (!isNaN(parseInt(user, 10)) && alias && String(alias).trim().length > 0) {
        Aliases.insert({_id: alias, user: user}, function(err, id) { console.log("inserted:", err, id)} );
      } else console.log("Invalid user or blank alias. Nothing done.");
    },
    aliasRemove: function (alias) {
      console.log("calling remove alias", alias)
      Aliases.remove({_id: alias}, function(err, id) { console.log("removed:", err, id)} );
    },
    paymentCycleReason: function (movement) {
      console.log("calling cycle reason", movement);
      if (movement && String(movement).trim().length > 0) {
        var payment = Payments.findOne(movement);
        if (payment) {
          var reason = payment.type;
          reason = reasons[(reasons.indexOf(reason) + 1) % reasons.length];
        } else reason = reasons[0];

        Payments.upsert(movement, { $set: { type: reason }}, function(err, id) {
          if (err) console.log("Failed to update payment", err)
        });
      } else console.log("Invalid payment id, can't set reason.");
    },
    paymentToggleMonth: function (movement, year, month) {
      console.log("calling toggle month", movement, year, month);
      if (movement && String(movement).trim().length > 0) {
        var payment = Payments.findOne(movement);
        if (payment) {
          var ym = pad(year, 4) + pad(parseInt(month, 10) + 1, 2);
          var months = payment.months || [];

          if (payment.months && payment.months.indexOf(ym) != -1) {
            months = _.without(months, ym);
          } else {
            months.push(ym);
            months.sort();
          }
          console.log(months);
          Payments.upsert(movement, { $set: { months: months }}, function(err, id) {
            if (err) console.log("Failed to update payment", err)
          });
        }
      }
    },
    paymentMemberRemove: function (payment) {
      console.log("calling remove member", payment);
      if (payment)
        Payments.update({_id: payment}, {$unset: { member: "" }});
    },
    paymentMemberSet: function (payment, member) {
      console.log("calling set member", payment, member);
      if (payment)
        Payments.upsert(payment, {$set: { member: member }}, function(err, id) {
          if (err) console.log("upsert failed", id);
        });
    }
  })

}
