Export = {}

Export.income = function(startOrder, from, response) {

	response.write("Orden,Mes,Dia,Num.Factura,Cliente,NIF,Tipo Operacion,Base Imponible,Tipo IVA,Retencion,IVA Repercutido,Total Factura,Total Cobrar\n")

	var payments = Payments.find({}).fetch();
	var ids = _.pluck(payments, '_id');
	_.each(Movements.find({$and: [
		{_id: {$in: ids}},
		{date: {$gt: from}}
		]}, {sort: { date: 1 }}).map(function(m) {
	  var p = _.find(payments, function(p) { return p._id == m._id });
	  if (p) m.payment = p;
	  return m;
	}), function(m) {
		var date = moment(String(m.date), 'YYYYMMDD');
		var amount = Util.renderAmount(m.amount);
		var member = (m.payment.member) ? Members.findOne(m.payment.member) : null;
		var out = [];
		out.push(startOrder++);
		out.push(date.month() + 1);
		out.push(date.date());
		out.push(m._id);
		if (member) {
			out.push(member.clean);
			out.push(member.fiscalId);
		} else {
			out.push("");
			out.push("");
		}
		out.push(m.payment.type);
		out.push(amount);
		out.push("21%,NO,0");
		out.push(amount);
		out.push(amount);

		response.write(out.join(",") + '\n');
	})
}
